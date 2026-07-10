import { useGetDashboardStats, useGetStatsByCategory, useGetStatsByModel, useGetRecentPartNumbers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Layers, Activity, FileDigit, Ban, PlusCircle, Calendar } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: categoryStats, isLoading: categoriesLoading } = useGetStatsByCategory();
  const { data: modelStats, isLoading: modelsLoading } = useGetStatsByModel();
  const { data: recentParts, isLoading: recentLoading } = useGetRecentPartNumbers();

  const PIE_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

  return (
    <div className="p-8 space-y-8 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of your part number registry.</p>
        </div>
        <Link href="/builder">
          <Button className="gap-2 font-medium">
            <PlusCircle className="w-4 h-4" />
            New Part Number
          </Button>
        </Link>
      </div>

      {statsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="h-32 animate-pulse bg-muted/50 border-muted" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Parts</CardTitle>
              <Layers className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{stats?.total || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Across all categories</p>
            </CardContent>
          </Card>
          
          <Card className="border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Parts</CardTitle>
              <Activity className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{stats?.active || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Ready for production</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Draft Parts</CardTitle>
              <FileDigit className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{stats?.draft || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Work in progress</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-destructive shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Deprecated</CardTitle>
              <Ban className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{stats?.deprecated || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Legacy records</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 shadow-sm border-border/60">
          <CardHeader>
            <CardTitle className="text-lg">Part Categories</CardTitle>
            <CardDescription>Distribution of parts by category</CardDescription>
          </CardHeader>
          <CardContent className="h-72 flex items-center justify-center">
            {categoriesLoading ? (
              <div className="animate-pulse w-48 h-48 rounded-full bg-muted/50" />
            ) : (categoryStats && categoryStats.length > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="category"
                  >
                    {categoryStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-muted-foreground text-sm">No data available</div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1 lg:col-span-2 shadow-sm border-border/60">
          <CardHeader>
            <CardTitle className="text-lg">Parts by Model</CardTitle>
            <CardDescription>Top models by part count</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {modelsLoading ? (
               <div className="w-full h-full animate-pulse bg-muted/30 rounded-md" />
            ) : (modelStats && modelStats.length > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modelStats.slice(0, 10)} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="model" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip 
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No data available</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-border/60">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="text-lg">Recent Part Numbers</CardTitle>
            <CardDescription>The 10 most recently generated codes</CardDescription>
          </div>
          <div className="flex gap-4 text-sm font-medium text-muted-foreground">
            <div className="flex items-center gap-1"><Calendar className="w-4 h-4"/> This Week: <span className="text-foreground">{stats?.createdThisWeek || 0}</span></div>
            <div className="flex items-center gap-1"><Calendar className="w-4 h-4"/> This Month: <span className="text-foreground">{stats?.createdThisMonth || 0}</span></div>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground uppercase">
              <tr>
                <th className="px-6 py-3 font-medium">Part Number</th>
                <th className="px-6 py-3 font-medium">Category</th>
                <th className="px-6 py-3 font-medium">Model</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {recentLoading ? (
                Array.from({length: 5}).map((_, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="px-6 py-4"><div className="h-4 bg-muted animate-pulse rounded w-48"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-muted animate-pulse rounded w-24"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-muted animate-pulse rounded w-20"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-muted animate-pulse rounded w-16"></div></td>
                    <td className="px-6 py-4"></td>
                  </tr>
                ))
              ) : (recentParts && recentParts.length > 0) ? (
                recentParts.map((part) => (
                  <tr key={part.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors last:border-0">
                    <td className="px-6 py-3 font-mono font-medium text-primary">{part.partNumber}</td>
                    <td className="px-6 py-3 text-foreground">{part.productCategory || '-'}</td>
                    <td className="px-6 py-3 text-muted-foreground">{part.productModel || '-'}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        part.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' :
                        part.status === 'draft' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' :
                        'bg-destructive/10 text-destructive border border-destructive/20'
                      }`}>
                        {part.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Link href={`/library/${part.id}`}>
                        <Button variant="ghost" size="sm" className="h-8">View Detail</Button>
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">No recent parts found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
