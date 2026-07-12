import { useState } from "react";
import { useListSegments, useGetSegment, useAddSegmentValue, useUpdateSegmentValue, useDeleteSegmentValue } from "@workspace/api-client-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Edit2, Trash2, Code2, Tag, Search, ToggleLeft } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AiInsights } from "@/components/ai/ai-insights";
import { useAuth } from "@/lib/auth";
import { invalidateAi } from "@/lib/ai-refresh";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Segments() {
  const { data: segments, isLoading, refetch } = useListSegments();
  const [search, setSearch] = useState("");
  
  const filteredSegments = segments?.filter(s => 
    s.label.toLowerCase().includes(search.toLowerCase()) || 
    s.key.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 max-w-6xl mx-auto flex flex-col h-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Segment Configuration</h1>
          <p className="text-muted-foreground mt-1">Manage the allowed codes and definitions for part number generation.</p>
        </div>
      </div>

      <div className="mb-6">
        <AiInsights
          scope="segments"
          title="Segment Intelligence"
          description="Which codes are used, unused, or missing — learned from real parts."
        />
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden shadow-sm border-border">
        <div className="p-4 border-b border-border bg-muted/20 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search segments..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="space-y-4 p-4">
              {[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-muted/50 animate-pulse rounded-md w-full" />)}
            </div>
          ) : filteredSegments?.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No segments found matching "{search}"</div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {filteredSegments?.map((segment) => (
                <SegmentItem key={segment.key} segment={segment} onUpdate={refetch} />
              ))}
            </Accordion>
          )}
        </div>
      </Card>
    </div>
  );
}

function SegmentItem({ segment, onUpdate }: { segment: any, onUpdate: () => void }) {
  const { toast } = useToast();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can("manageSegments");
  const { mutateAsync: addValue } = useAddSegmentValue();
  const { mutateAsync: updateValue } = useUpdateSegmentValue();
  const { mutateAsync: deleteValue } = useDeleteSegmentValue();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const handleAdd = async () => {
    try {
      if(!newCode || !newDesc) {
        toast({title: "Validation", description: "Code and description required.", variant:"destructive"});
        return;
      }
      await addValue({ key: segment.key, data: { code: newCode, description: newDesc, sortOrder: segment.values.length } });
      toast({ title: "Value Added", description: `Added ${newCode} to ${segment.label}` });
      setIsAddOpen(false);
      setNewCode("");
      setNewDesc("");
      invalidateAi(queryClient);
      onUpdate();
    } catch(err) {
      toast({ title: "Error", description: "Failed to add value.", variant: "destructive" });
    }
  };

  const handleToggleActive = async (code: string, isActive: boolean) => {
    try {
      await updateValue({ key: segment.key, code, data: { isActive } });
      invalidateAi(queryClient);
      onUpdate();
    } catch(err) {
      toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
    }
  };

  const handleDelete = async (code: string) => {
    try {
      await deleteValue({ key: segment.key, code });
      toast({ title: "Deleted", description: `Removed ${code}.` });
      invalidateAi(queryClient);
      onUpdate();
    } catch(err) {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
    }
  };

  return (
    <AccordionItem value={segment.key} className="px-4 border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
      <AccordionTrigger className="hover:no-underline py-4">
        <div className="flex items-center justify-between w-full pr-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Code2 className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold text-foreground text-base">{segment.label}</h3>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">{segment.key}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-muted text-muted-foreground">
              {segment.values.length} codes
            </span>
            {segment.isRequired && (
              <span className="text-xs font-bold px-2 py-1 rounded text-red-500 bg-red-500/10">Required</span>
            )}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-6">
        <div className="pl-14 pr-4">
          <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/40 text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold text-xs w-32">Code</th>
                  <th className="px-4 py-3 font-semibold text-xs">Description</th>
                  <th className="px-4 py-3 font-semibold text-xs w-24 text-center">Active</th>
                  <th className="px-4 py-3 font-semibold text-xs w-24 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {segment.values.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No codes configured.</td></tr>
                ) : (
                  segment.values.sort((a: any, b: any) => a.sortOrder - b.sortOrder).map((val: any) => (
                    <tr key={val.code} className={`hover:bg-muted/20 ${!val.isActive ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-2 font-mono font-bold text-primary">{val.code}</td>
                      <td className="px-4 py-2 text-foreground font-medium">{val.description}</td>
                      <td className="px-4 py-2 text-center">
                        <Switch
                          checked={val.isActive}
                          disabled={!canManage}
                          onCheckedChange={(checked) => handleToggleActive(val.code, checked)}
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        {canManage ? (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDelete(val.code)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div className={`p-3 bg-muted/10 border-t border-border flex justify-end ${canManage ? "" : "hidden"}`}>
              <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/90">
                    <Plus className="w-4 h-4" /> Add Code
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add to {segment.label}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Code</Label>
                      <Input value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())} placeholder="e.g. MV" className="font-mono uppercase" />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="e.g. Medium Voltage (120-277V)" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                    <Button onClick={handleAdd}>Add Code</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
