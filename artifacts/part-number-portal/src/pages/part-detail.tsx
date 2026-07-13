import { useState } from "react";
import { useGetPartNumber, useDeletePartNumber, useUpdatePartNumber, useExplainPartNumber, PartNumberUpdateStatus, getGetPartNumberQueryKey, type AiExplainResponse } from "@workspace/api-client-react";
import { BUILDER_PREFILL_KEY, BUILDER_EDIT_ID_KEY } from "./builder";
import { useRoute, useLocation } from "wouter";
import { Link } from "wouter";
import { ArrowLeft, Copy, Trash2, Edit3, Settings2, FileDigit, Activity, Ban, ExternalLink, Calendar, CheckCircle, Sparkles, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CertificatesEditor, certStatusLabel, certStatusClasses, type Certificate } from "@/components/certificates-editor";
import { AiInsights } from "@/components/ai/ai-insights";
import { useAuth } from "@/lib/auth";
import { invalidateAi } from "@/lib/ai-refresh";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function PartDetail() {
  const [, params] = useRoute("/library/:id");
  const id = parseInt(params?.id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const { data: part, isLoading, refetch } = useGetPartNumber(id, { query: { enabled: !!id, queryKey: getGetPartNumberQueryKey(id) } });
  const { mutateAsync: updatePart } = useUpdatePartNumber();
  const { mutateAsync: deletePart } = useDeletePartNumber();
  const { mutateAsync: explainPart, isPending: isExplaining } = useExplainPartNumber();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [explanation, setExplanation] = useState<AiExplainResponse | null>(null);

  // Edit-details dialog state.
  const [editOpen, setEditOpen] = useState(false);
  const [editVendor, setEditVendor] = useState("");
  const [editStage, setEditStage] = useState("");
  const [editCerts, setEditCerts] = useState<Certificate[]>([]);
  const [editNotes, setEditNotes] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);

  const openEditDetails = () => {
    setEditVendor(part?.vendorName ?? "");
    setEditStage(part?.productStage ?? "");
    setEditCerts((part?.certificates as Certificate[]) ?? []);
    setEditNotes(part?.internalNotes ?? "");
    setEditOpen(true);
  };

  const saveDetails = async () => {
    setSavingDetails(true);
    try {
      const cleaned = editCerts
        .filter((c) => c.name.trim() !== "")
        .map((c) => ({ name: c.name.trim(), status: c.status || "pending" }));
      await updatePart({
        id,
        data: {
          vendorName: editVendor.trim() || null,
          productStage: editStage || null,
          certificates: cleaned.length > 0 ? cleaned : null,
          internalNotes: editNotes.trim() || null,
        },
      });
      invalidateAi(queryClient);
      toast({ title: "Details saved", description: "Product details updated." });
      setEditOpen(false);
      refetch();
    } catch {
      toast({ title: "Save failed", description: "Could not save the details.", variant: "destructive" });
    } finally {
      setSavingDetails(false);
    }
  };

  const handleExplain = async () => {
    if (!id) return;
    try {
      const res = await explainPart({ data: { partId: id, partNumber: null } });
      setExplanation(res);
    } catch (err) {
      toast({ title: "Explain failed", description: "Could not generate an explanation.", variant: "destructive" });
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await updatePart({ id, data: { status: newStatus as PartNumberUpdateStatus } });
      invalidateAi(queryClient);
      toast({ title: "Status Updated", description: `Part is now ${newStatus}.` });
      refetch();
    } catch (err) {
      toast({ title: "Update Error", description: "Failed to change status.", variant: "destructive" });
    }
  };

  // Build the builder's pre-fill payload from this part's fields.
  const partToPrefill = () => {
    if (!part) return null;
    return {
      productCategory: part.productCategory ?? "",
      productName: part.productName ?? "",
      sku: part.sku ?? "",
      productDescription: part.productDescription ?? "",
      internalNotes: part.internalNotes ?? "",
      vendorName: part.vendorName ?? "",
      productStage: part.productStage ?? "",
      certificates: (part.certificates as Certificate[]) ?? [],
      company: part.company ?? "",
      productModel: part.productModel ?? "",
      versionVariant: part.versionVariant ?? "",
      sizeVariant: part.sizeVariant ?? "",
      powerType: part.powerType ?? "",
      maxPower: part.maxPower ?? "",
      voltageRange: part.voltageRange ?? "",
      dimming: part.dimming ?? "",
      cct: part.cct ?? "",
      lightDistribution: part.lightDistribution ?? "",
      driver: part.driver ?? "",
      finish: part.finish ?? "",
      manufacturer: part.manufacturer ?? "",
      lensType: part.lensType ?? "",
      emergencyOption: part.emergencyOption ?? "",
      sensorOption: part.sensorOption ?? "",
      surgeProtection: part.surgeProtection ?? "",
      reflectorCover: part.reflectorCover ?? "",
      mountingOption: part.mountingOption ?? "",
      photocontrolOption: part.photocontrolOption ?? "",
      connectableOption: part.connectableOption ?? "",
      base: part.base ?? "",
      status: part.status,
    };
  };

  // "Edit": open the builder pre-filled to change every field (segments + metadata)
  // and save back to THIS part.
  const handleFullEdit = () => {
    const prefill = partToPrefill();
    if (!prefill || !part) return;
    sessionStorage.setItem(BUILDER_PREFILL_KEY, JSON.stringify(prefill));
    sessionStorage.setItem(BUILDER_EDIT_ID_KEY, String(part.id));
    setLocation("/builder");
  };

  // "Duplicate & Edit": pre-fill the builder to create a NEW part from this one
  // (blank SKU, drafts a fresh number) — no "_COPY_" clone.
  const handleDuplicateEdit = () => {
    const prefill = partToPrefill();
    if (!prefill) return;
    sessionStorage.setItem(BUILDER_PREFILL_KEY, JSON.stringify({ ...prefill, sku: "" }));
    setLocation("/builder");
  };

  const handleDelete = async () => {
    try {
      await deletePart({ id });
      invalidateAi(queryClient);
      toast({ title: "Deleted", description: "Part number permanently removed." });
      setLocation("/library");
    } catch (err) {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
    }
  };

  const copyCode = () => {
    if (part) {
      navigator.clipboard.writeText(part.partNumber);
      toast({ title: "Copied", description: "Part number copied to clipboard." });
    }
  };

  if (isLoading) {
    return <div className="p-4 sm:p-8 h-full flex items-center justify-center">Loading record...</div>;
  }

  if (!part) {
    return <div className="p-4 sm:p-8 h-full flex flex-col items-center justify-center">
      <h2 className="text-2xl font-bold">Part Not Found</h2>
      <Button variant="link" onClick={() => setLocation("/library")}>Return to Library</Button>
    </div>;
  }

  const SegmentDisplay = ({ label, value }: { label: string, value?: string | null }) => {
    if (!value) return null;
    return (
      <div className="flex flex-col p-3 rounded-lg border border-border bg-card">
        <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">{label}</span>
        <span className="font-mono text-primary font-bold">{value}</span>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <Link href="/library" className="hover:text-foreground flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Library
        </Link>
        <span>/</span>
        <span className="text-foreground font-mono">{part.partNumber}</span>
      </div>

      <div className="bg-sidebar text-sidebar-foreground border border-sidebar-border rounded-xl p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-1/3 h-full bg-primary/10 blur-[100px] pointer-events-none" />
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 mb-3">
               <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                  part.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                  part.status === 'draft' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                  'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}>
                  {part.status}
                </span>
                <span className="text-sidebar-foreground/60 text-sm font-medium">{part.productCategory}</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-mono font-bold tracking-tight text-primary drop-shadow-sm flex flex-wrap items-center gap-3 break-all">
              <span className="break-all">{part.partNumber}</span>
              <Button variant="ghost" size="icon" onClick={copyCode} className="shrink-0 text-sidebar-foreground/50 hover:text-white hover:bg-white/10 rounded-full h-10 w-10">
                <Copy className="w-5 h-5" />
              </Button>
            </h1>
            <p className="text-xl text-sidebar-foreground mt-4 font-medium">{part.productName || "No Product Name"}</p>
          </div>

          {can("edit") || can("duplicate") || can("delete") ? (
            <div className="flex flex-col gap-3 w-full md:w-[220px] shrink-0">
              {can("edit") ? (
                <Select value={part.status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="bg-sidebar-accent border-sidebar-accent-border text-sidebar-foreground">
                    <SelectValue placeholder="Change Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft"><span className="flex items-center gap-2"><FileDigit className="w-4 h-4 text-amber-500"/> Draft</span></SelectItem>
                    <SelectItem value="active"><span className="flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-500"/> Active</span></SelectItem>
                    <SelectItem value="deprecated"><span className="flex items-center gap-2"><Ban className="w-4 h-4 text-destructive"/> Deprecated</span></SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
              {can("edit") ? (
                <Button variant="default" className="w-full" onClick={handleFullEdit}>
                  <Edit3 className="w-4 h-4 mr-2" /> Edit Part
                </Button>
              ) : null}
              <div className="flex gap-2">
                {can("duplicate") ? (
                  <Button variant="outline" className="flex-1 border-sidebar-accent text-sidebar-foreground bg-sidebar-accent/50 hover:bg-sidebar-accent" onClick={handleDuplicateEdit}>
                    <Copy className="w-4 h-4 mr-2" /> Duplicate
                  </Button>
                ) : null}
                {can("delete") ? (
                  <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="border-red-900/50 text-red-400 bg-red-950/20 hover:bg-red-900/40 hover:text-red-300">
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Delete Part Number</DialogTitle>
                        <DialogDescription>
                          Are you sure you want to delete <strong className="font-mono text-foreground">{part.partNumber}</strong>? This action cannot be undone.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDelete}>Delete Permanently</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between py-4 bg-muted/20 border-b border-border">
              <div>
                <CardTitle className="text-lg flex items-center gap-2"><Building2 className="w-5 h-5 text-primary" /> Product Details &amp; Notes</CardTitle>
                <CardDescription>Vendor, certificates, stage, and internal notes.</CardDescription>
              </div>
              {can("edit") ? (
                <Button variant="secondary" size="sm" onClick={openEditDetails}>
                  <Edit3 className="w-4 h-4 mr-2" /> Edit
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="p-6 grid gap-6 md:grid-cols-2">
              <div>
                <span className="block text-xs uppercase font-bold tracking-wider text-muted-foreground mb-1">Vendor</span>
                <span className="font-medium text-foreground">{part.vendorName || "Not set"}</span>
              </div>
              <div>
                <span className="block text-xs uppercase font-bold tracking-wider text-muted-foreground mb-1">Product Stage</span>
                {part.productStage ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize bg-primary/10 text-primary border border-primary/20">{part.productStage}</span>
                ) : (
                  <span className="text-muted-foreground">Not set</span>
                )}
              </div>
              <div className="md:col-span-2">
                <span className="block text-xs uppercase font-bold tracking-wider text-muted-foreground mb-2">Certificates</span>
                {part.certificates && part.certificates.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {part.certificates.map((c, i) => (
                      <span key={i} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm">
                        <span className="font-medium text-foreground">{c.name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${certStatusClasses(c.status)}`}>{certStatusLabel(c.status)}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">No certificates added.</span>
                )}
              </div>
              <div className="md:col-span-2">
                <span className="block text-xs uppercase font-bold tracking-wider text-muted-foreground mb-1">Internal Notes</span>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {part.internalNotes || <span className="text-muted-foreground">No internal notes provided.</span>}
                </p>
              </div>
            </CardContent>
          </Card>

          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit product details</DialogTitle>
                <DialogDescription>Vendor, stage, certificates, and internal notes for this part.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
                <div>
                  <Label className="mb-1.5 block">Vendor Name</Label>
                  <Input value={editVendor} onChange={(e) => setEditVendor(e.target.value)} placeholder="Supplier / vendor name" />
                </div>
                <div>
                  <Label className="mb-1.5 block">Product Stage</Label>
                  <Select value={editStage || undefined} onValueChange={setEditStage}>
                    <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stocked">Stocked</SelectItem>
                      <SelectItem value="temporary">Temporary</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1.5 block">Certificates</Label>
                  <CertificatesEditor value={editCerts} onChange={setEditCerts} />
                </div>
                <div>
                  <Label className="mb-1.5 block">Internal Notes</Label>
                  <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Notes visible to your team" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button onClick={saveDetails} disabled={savingDetails}>{savingDetails ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {part.productDescription ? (
            <Card className="shadow-sm">
              <CardHeader className="py-4 bg-muted/20 border-b border-border">
                <CardTitle className="text-lg flex items-center gap-2"><FileDigit className="w-5 h-5 text-primary" /> Description</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <p className="text-sm leading-7 text-foreground whitespace-pre-wrap">{part.productDescription}</p>
              </CardContent>
            </Card>
          ) : null}

          <Card className="shadow-sm">
            <CardHeader className="py-4 bg-muted/20 border-b border-border">
              <CardTitle className="text-lg flex items-center gap-2"><Settings2 className="w-5 h-5 text-primary" /> Structure Breakdown</CardTitle>
              <CardDescription>Every segment that makes up this part number.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SegmentDisplay label="Company" value={part.company} />
                <SegmentDisplay label="Model" value={part.productModel} />
                <SegmentDisplay label="Variant" value={part.versionVariant} />
                <SegmentDisplay label="Size" value={part.sizeVariant} />
                <SegmentDisplay label="Power Type" value={part.powerType} />
                <SegmentDisplay label="Max Power" value={part.maxPower} />
                <SegmentDisplay label="Voltage" value={part.voltageRange} />
                <SegmentDisplay label="Dimming" value={part.dimming} />
                <SegmentDisplay label="CCT" value={part.cct} />
                <SegmentDisplay label="Distribution" value={part.lightDistribution} />
                <SegmentDisplay label="Driver" value={part.driver} />
                <SegmentDisplay label="Finish" value={part.finish} />
                <SegmentDisplay label="Manufacturer" value={part.manufacturer} />
                <SegmentDisplay label="Lens" value={part.lensType} />
                <SegmentDisplay label="Emergency" value={part.emergencyOption} />
                <SegmentDisplay label="Sensor" value={part.sensorOption} />
                <SegmentDisplay label="Surge Prot" value={part.surgeProtection} />
                <SegmentDisplay label="Reflector" value={part.reflectorCover} />
                <SegmentDisplay label="Mounting" value={part.mountingOption} />
                <SegmentDisplay label="Photocontrol" value={part.photocontrolOption} />
                <SegmentDisplay label="Connectable" value={part.connectableOption} />
                <SegmentDisplay label="Base" value={part.base} />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between py-4 bg-muted/20 border-b border-border">
              <div>
                <CardTitle className="text-lg flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /> Plain-English Explanation</CardTitle>
                <CardDescription>What every segment of this code actually means.</CardDescription>
              </div>
              <Button variant="secondary" size="sm" onClick={handleExplain} disabled={isExplaining}>
                {isExplaining ? "Explaining..." : explanation ? "Regenerate" : "Explain This Part"}
              </Button>
            </CardHeader>
            <CardContent className="p-6">
              {explanation ? (
                <div className="space-y-4">
                  <p className="text-sm leading-7 text-foreground">{explanation.summary}</p>
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {explanation.segments.map((seg) => (
                      <div key={seg.key} className="flex items-start gap-3 px-4 py-2.5">
                        <span className="min-w-[130px] text-xs font-bold uppercase tracking-wider text-muted-foreground">{seg.label}</span>
                        <span className="font-mono font-bold text-primary">{seg.code}</span>
                        <span className="flex-1 text-sm text-muted-foreground">{seg.meaning}</span>
                      </div>
                    ))}
                  </div>
                  {!explanation.aiConfigured ? (
                    <p className="text-[11px] text-muted-foreground">
                      Descriptions come from your segment catalog. Add a free GROQ_API_KEY for an AI-written summary.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="py-10 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-xl">
                  <Sparkles className="w-10 h-10 mb-3 text-muted" />
                  <p className="text-sm">Click "Explain This Part" for a human-readable breakdown.</p>
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        <div className="space-y-6">
          <AiInsights
            scope="part"
            partId={id}
            title="AI Review"
            description="Checks this part against your registry."
          />

          <Card className="shadow-sm bg-muted/10">
            <CardHeader className="py-4 border-b border-border">
              <CardTitle className="text-base">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4 text-sm">
              <div>
                <span className="block text-muted-foreground mb-1 text-xs uppercase font-bold tracking-wider">SKU / Item Code</span>
                <span className="font-medium text-foreground">{part.sku || "Not assigned"}</span>
              </div>
              <div>
                <span className="block text-muted-foreground mb-1 text-xs uppercase font-bold tracking-wider">Created At</span>
                <span className="font-medium flex items-center gap-2"><Calendar className="w-3 h-3 text-muted-foreground" /> {format(new Date(part.createdAt), "MMM d, yyyy 'at' h:mm a")}</span>
              </div>
              <div>
                <span className="block text-muted-foreground mb-1 text-xs uppercase font-bold tracking-wider">Last Modified</span>
                <span className="font-medium flex items-center gap-2"><Calendar className="w-3 h-3 text-muted-foreground" /> {format(new Date(part.updatedAt), "MMM d, yyyy 'at' h:mm a")}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
