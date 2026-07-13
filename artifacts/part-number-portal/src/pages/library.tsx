import { useState } from "react";
import { useListPartNumbers, ListPartNumbersStatus } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Search, Filter, Plus, ChevronRight, SlidersHorizontal, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AiInsights } from "@/components/ai/ai-insights";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";

const PAGE_SIZE = 50;

export default function Library() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ListPartNumbersStatus | "all">("all");
  const [category, setCategory] = useState<string>("all");
  const [page, setPage] = useState(1);

  const { data: partNumbersData, isLoading } = useListPartNumbers({
    search: search || undefined,
    status: status !== "all" ? status : undefined,
    category: category !== "all" ? category : undefined,
    page,
    limit: PAGE_SIZE,
  });

  const parts = partNumbersData?.data || [];
  const total = partNumbersData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Part Library</h1>
          <p className="text-muted-foreground mt-1">Browse, search, and manage all generated part numbers.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2 font-medium">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          {can("create") ? (
            <Link href="/builder">
              <Button className="gap-2 font-medium">
                <Plus className="w-4 h-4" /> New Part
              </Button>
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mb-6">
        <AiInsights
          scope="library"
          title="Registry Health"
          description="Data-quality checks across every part number."
        />
      </div>

      <div className="bg-card border border-border shadow-sm rounded-xl flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/20 flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search part numbers, codes, names..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-9 w-full bg-background border-border"
            />
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center text-sm font-medium text-muted-foreground">
              <SlidersHorizontal className="w-4 h-4 mr-2" /> Filters
            </div>
            
            <Select value={status} onValueChange={(v: any) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-[140px] bg-background">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="deprecated">Deprecated</SelectItem>
              </SelectContent>
            </Select>

            <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
              <SelectTrigger className="w-[160px] bg-background">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="High Bay">High Bay</SelectItem>
                <SelectItem value="Linear">Linear</SelectItem>
                <SelectItem value="Vapor Tight">Vapor Tight</SelectItem>
                <SelectItem value="Area Light">Area Light</SelectItem>
                <SelectItem value="Wall Pack">Wall Pack</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground uppercase sticky top-0 backdrop-blur-md z-10 shadow-sm border-b border-border">
              <tr>
                <th className="px-6 py-4 font-semibold text-xs tracking-wider">Part Number</th>
                <th className="px-6 py-4 font-semibold text-xs tracking-wider">Product Name</th>
                <th className="px-6 py-4 font-semibold text-xs tracking-wider">Category</th>
                <th className="px-6 py-4 font-semibold text-xs tracking-wider">Status</th>
                <th className="px-6 py-4 font-semibold text-xs tracking-wider">Created</th>
                <th className="px-6 py-4 font-semibold text-xs tracking-wider text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({length: 10}).map((_, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4"><div className="h-4 bg-muted animate-pulse rounded w-64"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-muted animate-pulse rounded w-32"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-muted animate-pulse rounded w-24"></div></td>
                    <td className="px-6 py-4"><div className="h-6 bg-muted animate-pulse rounded-full w-16"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-muted animate-pulse rounded w-24"></div></td>
                    <td className="px-6 py-4"></td>
                  </tr>
                ))
              ) : parts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Search className="w-10 h-10 mb-4 text-muted" />
                      <p className="text-lg font-medium text-foreground">No parts found</p>
                      <p className="text-sm mt-1">Try adjusting your filters or search query.</p>
                      <Button variant="outline" className="mt-4" onClick={() => {setSearch(''); setStatus('all'); setCategory('all');}}>Clear Filters</Button>
                    </div>
                  </td>
                </tr>
              ) : (
                parts.map((part) => (
                  <tr key={part.id} className="hover:bg-muted/30 transition-colors group cursor-pointer">
                    <td className="px-6 py-3">
                      <Link href={`/library/${part.id}`} className="block">
                        <span className="font-mono font-bold text-primary group-hover:underline decoration-primary/50 underline-offset-4">{part.partNumber}</span>
                      </Link>
                    </td>
                    <td className="px-6 py-3 font-medium text-foreground">{part.productName || '-'}</td>
                    <td className="px-6 py-3 text-muted-foreground">{part.productCategory || '-'}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        part.status === 'active' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30' :
                        part.status === 'draft' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30' :
                        'bg-destructive/15 text-destructive dark:text-red-400 border border-destructive/30'
                      }`}>
                        {part.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground text-xs whitespace-nowrap">
                      {format(new Date(part.createdAt), 'MMM d, yyyy')}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Link href={`/library/${part.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground group-hover:text-primary group-hover:bg-primary/10">
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {partNumbersData && (
          <div className="p-4 border-t border-border bg-muted/10 text-xs text-muted-foreground flex flex-wrap justify-between items-center gap-3">
            <span>
              Showing {total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} items
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="px-1 font-medium text-foreground">Page {page} of {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
