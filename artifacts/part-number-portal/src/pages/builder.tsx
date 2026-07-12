import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  type AiBuilderDraft,
  type AiModelDefaultField,
  type AiFieldPrediction,
  type BuilderValidationResult,
  type PartNumberInput,
  PartNumberInputStatus,
  type SegmentDefinition,
  useCreatePartNumber,
  useGetModelDefaults,
  useListSegments,
  usePredictNextFields,
  useValidateBuilderPartNumber,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Database,
  GitBranchPlus,
  RefreshCw,
  Wand2,
  Check,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AiInsights } from "@/components/ai/ai-insights";
import { cn } from "@/lib/utils";
import { invalidateAi } from "@/lib/ai-refresh";
import { Sparkles, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type BuilderFormData = {
  productCategory: string;
  productName: string;
  sku: string;
  productDescription: string;
  internalNotes: string;
  company: string;
  productModel: string;
  versionVariant: string;
  sizeVariant: string;
  powerType: string;
  maxPower: string;
  voltageRange: string;
  dimming: string;
  cct: string;
  lightDistribution: string;
  driver: string;
  finish: string;
  manufacturer: string;
  lensType: string;
  emergencyOption: string;
  sensorOption: string;
  surgeProtection: string;
  reflectorCover: string;
  mountingOption: string;
  photocontrolOption: string;
  connectableOption: string;
  base: string;
  status: PartNumberInputStatus;
};

type SegmentFieldKey =
  | "company"
  | "productModel"
  | "versionVariant"
  | "sizeVariant"
  | "powerType"
  | "maxPower"
  | "voltageRange"
  | "dimming"
  | "cct"
  | "lightDistribution"
  | "driver"
  | "finish"
  | "manufacturer"
  | "lensType"
  | "emergencyOption"
  | "sensorOption"
  | "surgeProtection"
  | "reflectorCover"
  | "mountingOption"
  | "photocontrolOption"
  | "connectableOption"
  | "base";

const CLEAR_OPTION = "__none__";

const coreFields: Array<{ key: keyof BuilderFormData; label: string }> = [
  { key: "company", label: "Company" },
  { key: "productModel", label: "Product Model" },
  { key: "versionVariant", label: "Version / Variant" },
  { key: "sizeVariant", label: "Size Variant" },
  { key: "powerType", label: "Power Type" },
  { key: "maxPower", label: "Max Power" },
  { key: "voltageRange", label: "Voltage Range" },
  { key: "dimming", label: "Dimming" },
  { key: "cct", label: "CCT" },
  { key: "lightDistribution", label: "Light Distribution" },
  { key: "driver", label: "Driver" },
  { key: "finish", label: "Finish" },
  { key: "manufacturer", label: "Manufacturer" },
];

const optionalFields: Array<{ key: keyof BuilderFormData; label: string }> = [
  { key: "lensType", label: "Lens Type" },
  { key: "emergencyOption", label: "Emergency Option" },
  { key: "sensorOption", label: "Sensor Option" },
  { key: "surgeProtection", label: "Surge Protection" },
  { key: "reflectorCover", label: "Reflector Cover" },
  { key: "mountingOption", label: "Mounting Option" },
  { key: "photocontrolOption", label: "Photocontrol Option" },
  { key: "connectableOption", label: "Connectable Option" },
  { key: "base", label: "Base" },
];

const emptyForm: BuilderFormData = {
  productCategory: "",
  productName: "",
  sku: "",
  productDescription: "",
  internalNotes: "",
  company: "IK",
  productModel: "",
  versionVariant: "",
  sizeVariant: "",
  powerType: "",
  maxPower: "",
  voltageRange: "",
  dimming: "",
  cct: "",
  lightDistribution: "",
  driver: "",
  finish: "",
  manufacturer: "",
  lensType: "",
  emergencyOption: "",
  sensorOption: "",
  surgeProtection: "",
  reflectorCover: "",
  mountingOption: "",
  photocontrolOption: "",
  connectableOption: "",
  base: "",
  status: PartNumberInputStatus.draft,
};

function normalizeOptional(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// The 13 segment fields that actually contribute to the assembled code string.
// (Product Category / Product Name are metadata and are NOT part of the number.)
const stringSegmentFields: Array<keyof BuilderFormData> = [
  "company",
  "productModel",
  "versionVariant",
  "sizeVariant",
  "powerType",
  "maxPower",
  "voltageRange",
  "dimming",
  "cct",
  "lightDistribution",
  "driver",
  "finish",
  "manufacturer",
];

const optionalSegmentFields: Array<keyof BuilderFormData> = [
  "lensType",
  "emergencyOption",
  "sensorOption",
  "surgeProtection",
  "reflectorCover",
  "mountingOption",
  "photocontrolOption",
  "connectableOption",
  "base",
];

const PREVIEW_PLACEHOLDER = "·";

// Builds a live preview of the part number as fields are filled, using a
// placeholder for segments that are still empty. When all 13 core segments are
// set this matches the server-assembled part number exactly.
function buildLivePreview(form: BuilderFormData) {
  const val = (key: keyof BuilderFormData) => String(form[key] ?? "").trim();
  const seg = (key: keyof BuilderFormData) => val(key) || PREVIEW_PLACEHOLDER;

  const modelVersion = val("productModel")
    ? `${val("productModel")}${val("versionVariant") || PREVIEW_PLACEHOLDER}`
    : PREVIEW_PLACEHOLDER;
  const power = val("powerType")
    ? `${val("powerType")}${val("maxPower") || PREVIEW_PLACEHOLDER}`
    : PREVIEW_PLACEHOLDER;

  const core = [
    seg("company"),
    modelVersion,
    seg("sizeVariant"),
    power,
    seg("voltageRange"),
    seg("dimming"),
    seg("cct"),
    seg("lightDistribution"),
    seg("driver"),
    seg("finish"),
    seg("manufacturer"),
  ].join("-");

  const opts = optionalSegmentFields.map((key) => val(key)).filter(Boolean);
  const preview = opts.length > 0 ? `${core}-${opts.join("-")}` : core;

  const filledCount = stringSegmentFields.filter((key) => val(key)).length;

  return { preview, filledCount, total: stringSegmentFields.length };
}

function toValidationDraft(form: BuilderFormData): AiBuilderDraft {
  return {
    productCategory: form.productCategory || null,
    productName: form.productName || null,
    company: form.company || null,
    productModel: form.productModel || null,
    versionVariant: form.versionVariant || null,
    sizeVariant: form.sizeVariant || null,
    powerType: form.powerType || null,
    maxPower: form.maxPower || null,
    voltageRange: form.voltageRange || null,
    dimming: form.dimming || null,
    cct: form.cct || null,
    lightDistribution: form.lightDistribution || null,
    driver: form.driver || null,
    finish: form.finish || null,
    manufacturer: form.manufacturer || null,
    lensType: form.lensType || null,
    emergencyOption: form.emergencyOption || null,
    sensorOption: form.sensorOption || null,
    surgeProtection: form.surgeProtection || null,
    reflectorCover: form.reflectorCover || null,
    mountingOption: form.mountingOption || null,
    photocontrolOption: form.photocontrolOption || null,
    connectableOption: form.connectableOption || null,
    base: form.base || null,
  };
}

export default function Builder() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { data: segments, isLoading: segmentsLoading } = useListSegments();
  const queryClient = useQueryClient();
  const { mutateAsync: createPartNumber, isPending: isCreating } = useCreatePartNumber();
  const { mutateAsync: validateBuilderPartNumber, isPending: isValidating } = useValidateBuilderPartNumber();
  const { mutateAsync: predictNextFields } = usePredictNextFields();

  const [step, setStep] = useState(1);
  const [validation, setValidation] = useState<BuilderValidationResult | null>(null);
  const [formData, setFormData] = useState<BuilderFormData>(emptyForm);
  const [predictions, setPredictions] = useState<AiFieldPrediction[]>([]);
  const [predictBasis, setPredictBasis] = useState(0);
  const [predictFilled, setPredictFilled] = useState(0);

  const deferredFormData = useDeferredValue(formData);
  const segmentMap = useMemo(() => new Map((segments ?? []).map((segment) => [segment.key, segment])), [segments]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const result = await validateBuilderPartNumber({
          data: {
            draft: toValidationDraft(deferredFormData),
            ignoreId: null,
          },
        });
        if (!cancelled) {
          setValidation(result);
        }
      } catch {
        if (!cancelled) {
          setValidation(null);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [deferredFormData, validateBuilderPartNumber]);

  // Per-step AI predictions: as fields are filled, predict the most likely value
  // for each remaining segment from parts matching the current selection.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const result = await predictNextFields({ data: { draft: toValidationDraft(deferredFormData) } });
        if (!cancelled) {
          setPredictions(result.predictions);
          setPredictBasis(result.basisCount);
          setPredictFilled(result.filledCount);
        }
      } catch {
        if (!cancelled) setPredictions([]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [deferredFormData, predictNextFields]);

  const handleChange = (field: keyof BuilderFormData, value: string) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const getSegmentOptions = (field: SegmentFieldKey) => {
    const segment = segmentMap.get(field);
    if (!segment) {
      return [];
    }

    return segment.values
      .filter((value) => value.isActive)
      .filter((value) => {
        if (field === "productModel" || field === "company" || !formData.productModel) {
          return true;
        }
        return !value.applicableProducts?.length || value.applicableProducts.includes(formData.productModel);
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  };

  const { preview: livePreview, filledCount, total: totalSegments } = useMemo(
    () => buildLivePreview(deferredFormData),
    [deferredFormData],
  );
  const isPreviewComplete = filledCount === totalSegments;
  // Prefer the server-assembled string when the full draft is valid; otherwise
  // fall back to the live client-side preview so the code visibly builds up.
  const assembledCode = validation?.assembledPartNumber ?? livePreview;
  const copyableCode = validation?.assembledPartNumber ?? (isPreviewComplete ? livePreview : null);

  const handleCopy = async () => {
    if (!copyableCode) {
      return;
    }

    await navigator.clipboard.writeText(copyableCode);
    toast({ title: "Copied", description: "Part number copied to clipboard." });
  };

  const applyDefaultField = (field: keyof BuilderFormData, code: string) => {
    setFormData((current) => ({ ...current, [field]: code }));
  };

  const applyAllDefaults = (fields: AiModelDefaultField[]) => {
    setFormData((current) => {
      const next = { ...current };
      for (const f of fields) {
        // Never overwrite a value the user already chose.
        if (!String(next[f.field as keyof BuilderFormData] ?? "").trim()) {
          (next as Record<string, string>)[f.field] = f.code;
        }
      }
      return next;
    });
    toast({ title: "Common values applied", description: "Filled empty segments with your registry's most-used values." });
  };

  const handleReset = () => {
    setFormData(emptyForm);
    setValidation(null);
    setStep(1);
  };

  const handleCreate = async () => {
    if (!validation?.isReadyToCreate) {
      toast({ title: "Builder is not valid", description: "Resolve duplicate, missing, or invalid fields before creating.", variant: "destructive" });
      return;
    }

    const payload: PartNumberInput = {
      productCategory: formData.productCategory.trim(),
      productName: formData.productName.trim() || validation.assembledPartNumber || "Unnamed Part",
      sku: normalizeOptional(formData.sku),
      productDescription: normalizeOptional(formData.productDescription),
      internalNotes: normalizeOptional(formData.internalNotes),
      company: formData.company.trim(),
      productModel: formData.productModel.trim(),
      versionVariant: formData.versionVariant.trim(),
      sizeVariant: formData.sizeVariant.trim(),
      powerType: formData.powerType.trim(),
      maxPower: formData.maxPower.trim(),
      voltageRange: formData.voltageRange.trim(),
      dimming: formData.dimming.trim(),
      cct: formData.cct.trim(),
      lightDistribution: formData.lightDistribution.trim(),
      driver: formData.driver.trim(),
      finish: formData.finish.trim(),
      manufacturer: formData.manufacturer.trim(),
      lensType: normalizeOptional(formData.lensType),
      emergencyOption: normalizeOptional(formData.emergencyOption),
      sensorOption: normalizeOptional(formData.sensorOption),
      surgeProtection: normalizeOptional(formData.surgeProtection),
      reflectorCover: normalizeOptional(formData.reflectorCover),
      mountingOption: normalizeOptional(formData.mountingOption),
      photocontrolOption: normalizeOptional(formData.photocontrolOption),
      connectableOption: normalizeOptional(formData.connectableOption),
      base: normalizeOptional(formData.base),
      status: formData.status,
    };

    try {
      const created = await createPartNumber({ data: payload });
      invalidateAi(queryClient);
      toast({ title: "Part created — AI retrained", description: `${created.partNumber} added to what the model has learned.` });
      setLocation(`/library/${created.id}`);
    } catch {
      toast({ title: "Create failed", description: "The server rejected the part number create request.", variant: "destructive" });
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Part Builder</h1>
          <p className="mt-1 text-muted-foreground">
            Build part numbers with live validation, duplicate detection, and data-driven prefill.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleReset}>
            <RefreshCw className="w-4 h-4" />
            Reset
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !validation?.isReadyToCreate}>
            <CheckCircle2 className="w-4 h-4" />
            Create Part
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
        <div className="space-y-6">
          <SmartPrefill
            productModel={formData.productModel}
            modelOptions={getSegmentOptions("productModel")}
            onSelectModel={(code) => handleChange("productModel", code)}
            onApplyField={applyDefaultField}
            onApplyAll={applyAllDefaults}
            currentForm={formData}
          />

          <Card>
            <CardHeader className="border-b bg-muted/20">
              <CardTitle>Builder Steps</CardTitle>
              <CardDescription>Fill basics, core segments, then optional add-ons.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 p-6">
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3].map((value) => (
                  <Button
                    key={value}
                    variant={step === value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStep(value)}
                  >
                    Step {value}
                  </Button>
                ))}
              </div>

              {step === 1 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <TextField label="Product Category" value={formData.productCategory} onChange={(value) => handleChange("productCategory", value)} />
                  <TextField label="Product Name" value={formData.productName} onChange={(value) => handleChange("productName", value)} />
                  <TextField label="SKU" value={formData.sku} onChange={(value) => handleChange("sku", value)} />
                  <SelectField
                    label="Status"
                    value={formData.status}
                    options={[
                      { code: PartNumberInputStatus.draft, description: "Draft" },
                      { code: PartNumberInputStatus.active, description: "Active" },
                      { code: PartNumberInputStatus.deprecated, description: "Deprecated" },
                    ]}
                    onChange={(value) => handleChange("status", value as PartNumberInputStatus)}
                  />
                  <div className="md:col-span-2">
                    <Label className="mb-2 block">Product Description</Label>
                    <Textarea value={formData.productDescription} onChange={(event) => handleChange("productDescription", event.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="mb-2 block">Internal Notes</Label>
                    <Textarea value={formData.internalNotes} onChange={(event) => handleChange("internalNotes", event.target.value)} />
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {coreFields.map((field) => (
                    <SelectField
                      key={field.key}
                      label={field.label}
                      value={formData[field.key]}
                      options={getSegmentOptions(field.key as SegmentFieldKey)}
                      onChange={(value) => handleChange(field.key, value)}
                      isLoading={segmentsLoading}
                    />
                  ))}
                </div>
              ) : null}

              {step === 3 ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {optionalFields.map((field) => (
                    <SelectField
                      key={field.key}
                      label={field.label}
                      value={formData[field.key]}
                      options={getSegmentOptions(field.key as SegmentFieldKey)}
                      onChange={(value) => handleChange(field.key, value)}
                      allowClear
                      isLoading={segmentsLoading}
                    />
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <BuilderPredictions
            predictions={predictions}
            basisCount={predictBasis}
            filledCount={predictFilled}
            currentForm={deferredFormData}
            onApply={handleChange}
          />
        </div>

        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <Card>
            <CardHeader className="border-b bg-muted/20">
              <CardTitle>Live Output</CardTitle>
              <CardDescription>The builder assembles the code continuously as you select fields.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-6">
              <div className="rounded-xl border bg-sidebar px-4 py-5 text-sidebar-foreground">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/60">Assembled Part Number</p>
                  <Badge variant={isPreviewComplete ? "default" : "outline"}>
                    {filledCount}/{totalSegments} segments
                  </Badge>
                </div>
                <p className="mt-3 break-all font-mono text-lg font-bold text-primary">{assembledCode}</p>
                {!isPreviewComplete ? (
                  <p className="mt-2 text-xs text-sidebar-foreground/60">
                    Live preview — “{PREVIEW_PLACEHOLDER}” marks segments still to be filled.
                  </p>
                ) : null}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleCopy} disabled={!copyableCode}>
                  <Copy className="w-4 h-4" />
                  Copy
                </Button>
                <Link href="/library">
                  <Button variant="outline">
                    <GitBranchPlus className="w-4 h-4" />
                    Open Library
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <ValidationPanel
            validation={validation}
            isValidating={isValidating}
            onApplySuggestion={(field, code) => handleChange(field as keyof BuilderFormData, code)}
          />

          <AiInsights
            scope="builder"
            title="Builder Coach"
            description="Conventions learned from your existing parts."
          />
        </div>
      </div>
    </div>
  );
}

function BuilderPredictions({
  predictions,
  basisCount,
  filledCount,
  currentForm,
  onApply,
}: {
  predictions: AiFieldPrediction[];
  basisCount: number;
  filledCount: number;
  currentForm: BuilderFormData;
  onApply: (field: keyof BuilderFormData, value: string) => void;
}) {
  // Only surface predictions for fields the user hasn't set yet.
  const open = predictions.filter(
    (p) => !String(currentForm[p.field as keyof BuilderFormData] ?? "").trim() && p.candidates.length > 0,
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-gradient-to-r from-primary/[0.07] via-violet-500/[0.05] to-transparent">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-violet-500 text-white shadow-sm">
              <TrendingUp className="h-4 w-4" />
            </div>
            AI Next-Step Predictions
          </CardTitle>
          {basisCount > 0 ? (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Sparkles className="h-3 w-3" />
              {basisCount} matching part{basisCount > 1 ? "s" : ""}
            </Badge>
          ) : null}
        </div>
        <CardDescription>
          As you fill fields, the model predicts the rest from parts that match what you've chosen.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4">
        {open.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            {basisCount === 0 && filledCount > 0
              ? "No existing parts match this exact combination yet — you're building something new."
              : "Pick a couple of fields (start with Product Model) and predictions will appear here."}
          </div>
        ) : (
          <div className="space-y-2.5">
            {open.slice(0, 6).map((p) => {
              const top = p.candidates[0];
              return (
                <div key={p.field} className="rounded-lg border border-border p-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{p.label}</span>
                    <span className="text-[10px] text-muted-foreground">{top.confidence}% confident</span>
                  </div>
                  <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-to-r from-primary to-violet-500" style={{ width: `${top.confidence}%` }} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.candidates.map((c, i) => (
                      <button
                        key={c.code}
                        onClick={() => onApply(p.field as keyof BuilderFormData, c.code)}
                        title={c.description || undefined}
                        className={cn(
                          "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                          i === 0
                            ? "border-primary/40 bg-primary/5 font-semibold text-foreground hover:bg-primary/10"
                            : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                        )}
                      >
                        <span className="font-mono">{c.code}</span>
                        <span className="text-[10px] opacity-70">{c.confidence}%</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SmartPrefill({
  productModel,
  modelOptions,
  onSelectModel,
  onApplyField,
  onApplyAll,
  currentForm,
}: {
  productModel: string;
  modelOptions: Array<Pick<SegmentDefinition["values"][number], "code" | "description">>;
  onSelectModel: (code: string) => void;
  onApplyField: (field: keyof BuilderFormData, code: string) => void;
  onApplyAll: (fields: AiModelDefaultField[]) => void;
  currentForm: BuilderFormData;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-gradient-to-r from-primary/[0.07] via-violet-500/[0.05] to-transparent">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-violet-500 text-white shadow-sm">
              <Wand2 className="h-4 w-4" />
            </div>
            Smart Prefill
          </CardTitle>
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Database className="h-3 w-3" />
            From your data
          </Badge>
        </div>
        <CardDescription>
          Pick a model and fill segments with the values your existing parts actually use — no guessing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-6">
        <div>
          <Label className="mb-2 block">Product Model</Label>
          <Select value={productModel || undefined} onValueChange={onSelectModel}>
            <SelectTrigger>
              <SelectValue placeholder="Select a product model to start" />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((option) => (
                <SelectItem key={option.code} value={option.code}>
                  {option.code} {option.description ? `- ${option.description}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {productModel ? (
          <ModelDefaultsBody
            productModel={productModel}
            currentForm={currentForm}
            onApplyField={onApplyField}
            onApplyAll={onApplyAll}
          />
        ) : (
          <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Choose a product model above to see its most-used segment values.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ModelDefaultsBody({
  productModel,
  currentForm,
  onApplyField,
  onApplyAll,
}: {
  productModel: string;
  currentForm: BuilderFormData;
  onApplyField: (field: keyof BuilderFormData, code: string) => void;
  onApplyAll: (fields: AiModelDefaultField[]) => void;
}) {
  const { data, isLoading, isError } = useGetModelDefaults({ productModel });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/60" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/[0.04] px-4 py-6 text-center text-sm text-muted-foreground">
        Couldn't load prefill data. The API server may be running an older build — restart it with{" "}
        <span className="font-mono">pnpm --filter @workspace/api-server run dev</span>.
      </div>
    );
  }

  if (data.sampleSize === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        No existing <span className="font-mono">{productModel}</span> parts yet, so there's nothing to learn from.
        Fill the segments below manually — future builds will benefit.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">
          Learned from <span className="font-semibold text-foreground">{data.sampleSize}</span> existing{" "}
          <span className="font-mono">{productModel}</span> part{data.sampleSize > 1 ? "s" : ""}
        </p>
        <Button size="sm" onClick={() => onApplyAll(data.fields)}>
          <Wand2 className="h-3.5 w-3.5" />
          Apply all
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {data.fields.map((f) => {
          const applied = String(currentForm[f.field as keyof BuilderFormData] ?? "") === f.code;
          const strong = f.share >= 60;
          return (
            <button
              key={f.field}
              onClick={() => onApplyField(f.field as keyof BuilderFormData, f.code)}
              title={f.description || undefined}
              className={cn(
                "group flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                applied
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-border hover:border-primary/40 hover:bg-primary/5",
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {f.label}
                </p>
                <p className="font-mono text-sm font-bold text-foreground">{f.code}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    strong ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  {f.share}%
                </span>
                {applied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] leading-5 text-muted-foreground">
        Percentages show how often each value appears on your existing {productModel} parts. Click one to apply it, or
        <span className="font-medium"> Apply all</span> to fill every empty segment.
      </p>
    </div>
  );
}

function ValidationPanel({
  validation,
  isValidating,
  onApplySuggestion,
}: {
  validation: BuilderValidationResult | null;
  isValidating: boolean;
  onApplySuggestion: (field: string, code: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="border-b bg-muted/20">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>AI Validation Guardrails</CardTitle>
            <CardDescription>Duplicate checks, invalid code detection, and next-value suggestions.</CardDescription>
          </div>
          <Badge variant={validation?.isReadyToCreate ? "default" : "outline"}>
            {isValidating ? "Checking..." : validation?.isReadyToCreate ? "Ready" : "Review Needed"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-6">
        {validation?.duplicateMatch ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Exact duplicate detected</AlertTitle>
            <AlertDescription>
              <span className="block">{validation.duplicateMatch.partNumber}</span>
              <Link href={`/library/${validation.duplicateMatch.id}`} className="mt-2 inline-block text-sm underline">
                Open existing record
              </Link>
            </AlertDescription>
          </Alert>
        ) : null}

        {validation?.missingRequiredFields?.length ? (
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Missing Required Fields</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {validation.missingRequiredFields.map((item) => (
                <Badge key={item} variant="outline">{item}</Badge>
              ))}
            </div>
          </section>
        ) : null}

        {validation?.fieldIssues?.length ? (
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Field Issues</p>
            <div className="mt-2 space-y-2">
              {validation.fieldIssues.map((issue, index) => (
                <div key={`${issue.field}-${index}`} className="rounded-lg border px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">{issue.field}</span>
                    <Badge variant={issue.severity === "error" ? "destructive" : "outline"}>{issue.severity}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{issue.message}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {validation?.nextSuggestions?.length ? (
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suggested Next Values</p>
            <div className="mt-3 space-y-3">
              {validation.nextSuggestions.map((suggestion) => (
                <div key={suggestion.field} className="rounded-lg border px-3 py-3">
                  <p className="text-sm font-medium text-foreground">{suggestion.label}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {suggestion.values.map((value) => (
                      <Button
                        key={`${suggestion.field}-${value.code}`}
                        variant="outline"
                        size="sm"
                        onClick={() => onApplySuggestion(suggestion.field, value.code)}
                      >
                        {value.code}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {validation?.similarMatches?.length ? (
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Similar Existing Parts</p>
            <div className="mt-2 space-y-2">
              {validation.similarMatches.map((match) => (
                <div key={match.id} className="rounded-lg border px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link href={`/library/${match.id}`} className="font-mono text-sm font-semibold text-primary hover:underline">
                        {match.partNumber}
                      </Link>
                      <p className="mt-1 text-sm text-muted-foreground">{match.productName}</p>
                    </div>
                    <Badge variant="outline">{match.similarityScore}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!validation?.duplicateMatch &&
        !validation?.missingRequiredFields?.length &&
        !validation?.fieldIssues?.length &&
        !validation?.similarMatches?.length ? (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No blockers detected. Continue filling the builder to refine the result.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  allowClear = false,
  isLoading = false,
}: {
  label: string;
  value: string;
  options: Array<Pick<SegmentDefinition["values"][number], "code" | "description">>;
  onChange: (value: string) => void;
  allowClear?: boolean;
  isLoading?: boolean;
}) {
  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      <Select
        value={value || undefined}
        onValueChange={(nextValue) => onChange(nextValue === CLEAR_OPTION ? "" : nextValue)}
      >
        <SelectTrigger>
          <SelectValue placeholder={isLoading ? "Loading..." : `Select ${label}`} />
        </SelectTrigger>
        <SelectContent>
          {allowClear ? <SelectItem value={CLEAR_OPTION}>None</SelectItem> : null}
          {options.map((option) => (
            <SelectItem key={option.code} value={option.code}>
              {option.code} {option.description ? `- ${option.description}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
