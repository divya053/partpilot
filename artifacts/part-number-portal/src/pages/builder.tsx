import { useState, useMemo } from "react";
import { useListSegments, useCreatePartNumber, PartNumberInputStatus, PartNumberInput } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, CheckCircle2, Copy, AlertCircle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";

export default function Builder() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { data: segments, isLoading } = useListSegments();
  const createPartNumber = useCreatePartNumber();

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<Partial<PartNumberInput>>({
    company: "IK",
    manufacturer: "BFU",
    status: "draft" as PartNumberInputStatus,
  });

  const getSegmentValues = (key: string) => {
    return segments?.find(s => s.key === key)?.values.filter(v => v.isActive) || [];
  };

  const handleChange = (key: keyof PartNumberInput, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const assembledPartNumber = useMemo(() => {
    const parts = [];
    
    // Core (e.g. IK-UHB302-S0240)
    const core = [
      formData.company || "IK",
      `${formData.productModel || "____"}${formData.versionVariant || "_"}`
    ];
    if (formData.sizeVariant) core.push(formData.sizeVariant);
    
    const power = `${formData.powerType || "_"}${formData.maxPower || "____"}`;
    if (power !== "_____") core.push(power);
    
    parts.push(core.join("-"));

    // Electrical & Output (e.g. MV-D-CCT-WD)
    const elec = [];
    if (formData.voltageRange) elec.push(formData.voltageRange);
    if (formData.dimming) elec.push(formData.dimming);
    if (formData.cct) elec.push(formData.cct);
    if (formData.lightDistribution) elec.push(formData.lightDistribution);
    if (formData.driver) elec.push(formData.driver);
    if (elec.length > 0) parts.push(elec.join("-"));

    // Finish & Options
    const opt = [];
    if (formData.finish) opt.push(formData.finish);
    if (formData.manufacturer) opt.push(formData.manufacturer);
    
    // Optionals
    const optionals = [
      formData.lensType, formData.emergencyOption, formData.sensorOption, 
      formData.surgeProtection, formData.reflectorCover, formData.mountingOption,
      formData.photocontrolOption, formData.connectableOption, formData.base
    ].filter(Boolean);
    
    if (optionals.length > 0) opt.push(...optionals);
    
    if (opt.length > 0) parts.push(opt.join("-"));

    return parts.join("-");
  }, [formData]);

  const handleSubmit = async () => {
    try {
      if (!formData.productModel || !formData.versionVariant) {
         toast({ title: "Validation Error", description: "Missing required core identity fields.", variant: "destructive" });
         return;
      }
      
      const payload: PartNumberInput = {
        ...formData,
        productCategory: formData.productCategory || "Unknown",
        productName: formData.productName || `IK ${formData.productModel}`,
        company: "IK",
        manufacturer: formData.manufacturer || "BFU",
      } as PartNumberInput;

      const result = await createPartNumber.mutateAsync({ data: payload });
      toast({ title: "Success", description: "Part number created successfully." });
      setLocation(`/library/${result.id}`);
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error || "Failed to create part number", variant: "destructive" });
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(assembledPartNumber);
    toast({ title: "Copied", description: "Part number copied to clipboard.", duration: 2000 });
  };

  if (isLoading) {
    return (
      <div className="p-8 h-full flex flex-col items-center justify-center">
        <RefreshCw className="w-8 h-8 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground">Loading configuration data...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto flex flex-col min-h-[calc(100vh-4rem)]">
      <div className="mb-8 bg-sidebar text-sidebar-foreground border border-sidebar-border rounded-xl p-6 shadow-xl sticky top-4 z-10 transition-all duration-300 relative overflow-hidden">
        <div className="absolute right-0 top-0 h-full w-64 bg-primary/5 blur-3xl rounded-full pointer-events-none" />
        <div className="flex justify-between items-center relative z-10">
          <div>
            <h2 className="text-sm font-medium text-sidebar-foreground/70 uppercase tracking-wider mb-2">Live Assembly</h2>
            <div className="text-3xl md:text-4xl font-mono font-bold tracking-tight text-primary drop-shadow-sm">
              {assembledPartNumber}
            </div>
          </div>
          <Button variant="outline" size="icon" onClick={copyToClipboard} className="border-sidebar-border text-foreground hover:bg-sidebar-accent">
            <Copy className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className="flex gap-4 mb-8">
        <div className={`h-2 flex-1 rounded-full transition-colors ${step >= 1 ? 'bg-primary' : 'bg-muted'}`} />
        <div className={`h-2 flex-1 rounded-full transition-colors ${step >= 2 ? 'bg-primary' : 'bg-muted'}`} />
        <div className={`h-2 flex-1 rounded-full transition-colors ${step >= 3 ? 'bg-primary' : 'bg-muted'}`} />
      </div>

      <div className="flex-1 bg-card border border-border shadow-sm rounded-xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        <div className="p-8">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-2xl font-semibold mb-1">Core Identity</h3>
                <p className="text-muted-foreground text-sm">Define the fundamental characteristics of the product.</p>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Select value={formData.company} disabled>
                    <SelectTrigger><SelectValue placeholder="Company" /></SelectTrigger>
                    <SelectContent><SelectItem value="IK">IK</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Product Category *</Label>
                  <Select value={formData.productCategory} onValueChange={v => handleChange('productCategory', v)}>
                    <SelectTrigger className={!formData.productCategory ? "border-amber-500/50" : ""}><SelectValue placeholder="Select Category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="High Bay">High Bay</SelectItem>
                      <SelectItem value="Linear">Linear</SelectItem>
                      <SelectItem value="Vapor Tight">Vapor Tight</SelectItem>
                      <SelectItem value="Area Light">Area Light</SelectItem>
                      <SelectItem value="Wall Pack">Wall Pack</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Product Model *</Label>
                  <Select value={formData.productModel} onValueChange={v => handleChange('productModel', v)}>
                    <SelectTrigger className={!formData.productModel ? "border-amber-500/50" : ""}><SelectValue placeholder="Select Model" /></SelectTrigger>
                    <SelectContent>
                      {getSegmentValues('productModel').map(v => (
                        <SelectItem key={v.code} value={v.code}>{v.code} - {v.description}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Version / Variant *</Label>
                  <Select value={formData.versionVariant} onValueChange={v => handleChange('versionVariant', v)}>
                    <SelectTrigger className={!formData.versionVariant ? "border-amber-500/50" : ""}><SelectValue placeholder="Select Version" /></SelectTrigger>
                    <SelectContent>
                      {getSegmentValues('versionVariant').map(v => (
                        <SelectItem key={v.code} value={v.code}>{v.code} - {v.description}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Size Variant</Label>
                  <Select value={formData.sizeVariant} onValueChange={v => handleChange('sizeVariant', v)}>
                    <SelectTrigger><SelectValue placeholder="Select Size (Optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {getSegmentValues('sizeVariant').map(v => (
                        <SelectItem key={v.code} value={v.code}>{v.code} - {v.description}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Internal Name (Optional)</Label>
                  <input 
                    type="text" 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="e.g. Apollo Gen 3"
                    value={formData.productName || ""}
                    onChange={e => handleChange('productName', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-2xl font-semibold mb-1">Power & Electrical</h3>
                <p className="text-muted-foreground text-sm">Configure power consumption, driver, and optical properties.</p>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Power Type *</Label>
                  <Select value={formData.powerType} onValueChange={v => handleChange('powerType', v)}>
                    <SelectTrigger><SelectValue placeholder="Select Type" /></SelectTrigger>
                    <SelectContent>
                      {getSegmentValues('powerType').map(v => (
                        <SelectItem key={v.code} value={v.code}>{v.code} - {v.description}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Max Power (Watts) *</Label>
                  <Select value={formData.maxPower} onValueChange={v => handleChange('maxPower', v)}>
                    <SelectTrigger><SelectValue placeholder="Select Power" /></SelectTrigger>
                    <SelectContent>
                      {getSegmentValues('maxPower').map(v => (
                        <SelectItem key={v.code} value={v.code}>{v.code} - {v.description}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Voltage Range *</Label>
                  <Select value={formData.voltageRange} onValueChange={v => handleChange('voltageRange', v)}>
                    <SelectTrigger><SelectValue placeholder="Select Voltage" /></SelectTrigger>
                    <SelectContent>
                      {getSegmentValues('voltageRange').map(v => (
                        <SelectItem key={v.code} value={v.code}>{v.code} - {v.description}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Dimming *</Label>
                  <Select value={formData.dimming} onValueChange={v => handleChange('dimming', v)}>
                    <SelectTrigger><SelectValue placeholder="Select Dimming" /></SelectTrigger>
                    <SelectContent>
                      {getSegmentValues('dimming').map(v => (
                        <SelectItem key={v.code} value={v.code}>{v.code} - {v.description}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>CCT (Color Temp) *</Label>
                  <Select value={formData.cct} onValueChange={v => handleChange('cct', v)}>
                    <SelectTrigger><SelectValue placeholder="Select CCT" /></SelectTrigger>
                    <SelectContent>
                      {getSegmentValues('cct').map(v => (
                        <SelectItem key={v.code} value={v.code}>{v.code} - {v.description}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Light Distribution *</Label>
                  <Select value={formData.lightDistribution} onValueChange={v => handleChange('lightDistribution', v)}>
                    <SelectTrigger><SelectValue placeholder="Select Distribution" /></SelectTrigger>
                    <SelectContent>
                      {getSegmentValues('lightDistribution').map(v => (
                        <SelectItem key={v.code} value={v.code}>{v.code} - {v.description}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Driver *</Label>
                  <Select value={formData.driver} onValueChange={v => handleChange('driver', v)}>
                    <SelectTrigger><SelectValue placeholder="Select Driver" /></SelectTrigger>
                    <SelectContent>
                      {getSegmentValues('driver').map(v => (
                        <SelectItem key={v.code} value={v.code}>{v.code} - {v.description}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-2xl font-semibold mb-1">Options & Finish</h3>
                <p className="text-muted-foreground text-sm">Select physical finish and additional optional components.</p>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Finish Color *</Label>
                  <Select value={formData.finish} onValueChange={v => handleChange('finish', v)}>
                    <SelectTrigger><SelectValue placeholder="Select Finish" /></SelectTrigger>
                    <SelectContent>
                      {getSegmentValues('finish').map(v => (
                        <SelectItem key={v.code} value={v.code}>{v.code} - {v.description}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Manufacturer</Label>
                  <Select value={formData.manufacturer} disabled>
                    <SelectTrigger><SelectValue placeholder="Select Manufacturer" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BFU">BFU</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="col-span-2 pt-4 border-t border-border">
                  <h4 className="text-sm font-medium mb-4 text-muted-foreground uppercase tracking-wider">Optional Add-ons</h4>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { key: 'sensorOption', label: 'Sensor' },
                      { key: 'emergencyOption', label: 'Emergency' },
                      { key: 'surgeProtection', label: 'Surge Protection' },
                      { key: 'lensType', label: 'Lens Type' },
                      { key: 'reflectorCover', label: 'Reflector' },
                      { key: 'mountingOption', label: 'Mounting' },
                      { key: 'photocontrolOption', label: 'Photocontrol' },
                      { key: 'connectableOption', label: 'Connectable' },
                    ].map(opt => (
                      <div key={opt.key} className="space-y-2">
                        <Label className="text-xs">{opt.label}</Label>
                        <Select value={(formData as any)[opt.key] || "none"} onValueChange={v => handleChange(opt.key as keyof PartNumberInput, v === "none" ? "" : v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {getSegmentValues(opt.key).map(v => (
                              <SelectItem key={v.code} value={v.code}>{v.code} - {v.description}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="col-span-2 pt-4 border-t border-border">
                  <div className="space-y-2">
                    <Label>Initial Status</Label>
                    <Select value={formData.status} onValueChange={v => handleChange('status', v as PartNumberInputStatus)}>
                      <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="deprecated">Deprecated</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="bg-muted/30 p-6 flex justify-between border-t border-border">
          <Button 
            variant="outline" 
            onClick={() => setStep(s => Math.max(1, s - 1))}
            disabled={step === 1}
          >
            Back
          </Button>
          
          {step < 3 ? (
            <Button onClick={() => setStep(s => Math.min(3, s + 1))} className="gap-2">
              Next Step <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={createPartNumber.isPending} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
              {createPartNumber.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Generate Part Number
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
