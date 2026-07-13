import { useState } from "react";
import { useGetPartNumber, useDeletePartNumber, useDuplicatePartNumber, useUpdatePartNumber, useExplainPartNumber, PartNumberUpdateStatus, getGetPartNumberQueryKey, type AiExplainResponse } from "@workspace/api-client-react";
import { useRoute, useLocation } from "wouter";
import { Link } from "wouter";
import { ArrowLeft, Copy, Trash2, Edit3, Settings2, FileDigit, Activity, Ban, ExternalLink, Calendar, CheckCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  const { mutateAsync: duplicatePart } = useDuplicatePartNumber();
  const { mutateAsync: deletePart } = useDeletePartNumber();
  const { mutateAsync: explainPart, isPending: isExplaining } = useExplainPartNumber();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [explanation, setExplanation] = useState<AiExplainResponse | null>(null);

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

  const handleDuplicate = async () => {
    try {
      const newPart = await duplicatePart({ id });
      invalidateAi(queryClient);
      toast({ title: "Duplicated", description: "Navigating to duplicate." });
      setLocation(`/library/${newPart.id}`);
    } catch (err) {
      toast({ title: "Error", description: "Failed to duplicate.", variant: "destructive" });
    }
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
    return <div className="p-8 h-full flex items-center justify-center">Loading record...</div>;
  }

  if (!part) {
    return <div className="p-8 h-full flex flex-col items-center justify-center">
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
    <div className="p-8 max-w-5xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 duration-300">
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
          <div>
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
            <h1 className="text-4xl md:text-5xl font-mono font-bold tracking-tight text-primary drop-shadow-sm flex items-center gap-4">
              {part.partNumber}
              <Button variant="ghost" size="icon" onClick={copyCode} className="text-sidebar-foreground/50 hover:text-white hover:bg-white/10 rounded-full h-10 w-10">
                <Copy className="w-5 h-5" />
              </Button>
            </h1>
            <p className="text-xl text-sidebar-foreground mt-4 font-medium">{part.productName || "No Product Name"}</p>
          </div>

          {can("edit") || can("duplicate") || can("delete") ? (
            <div className="flex flex-col gap-3 min-w-[200px]">
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
              <div className="flex gap-2">
                {can("duplicate") ? (
                  <Button variant="outline" className="flex-1 border-sidebar-accent text-sidebar-foreground bg-sidebar-accent/50 hover:bg-sidebar-accent" onClick={handleDuplicate}>
                    <Copy className="w-4 h-4 mr-2" /> Clone
                  </Button>
                ) : null}
                {can("delete") ? (
                  <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="border-red-900/50 text-red-400 bg-red-950/20 hover:bg-red-900/40 hover:text-red-300">
                        <Trash2 className="w-4 h-4" />
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

          <Card className="shadow-sm">
            <CardHeader className="py-4 bg-muted/20 border-b border-border">
              <CardTitle className="text-lg text-foreground">Internal Notes</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-muted-foreground whitespace-pre-wrap">
                {part.internalNotes || "No internal notes provided for this part."}
              </p>
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
