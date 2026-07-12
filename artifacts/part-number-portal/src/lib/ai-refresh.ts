import type { QueryClient } from "@tanstack/react-query";

/**
 * Instantly "re-train" the AI surfaces after the registry changes.
 *
 * All AI knowledge (insights, learning-status, model-defaults) is computed live
 * from the database, so the only thing needed after a create/edit/delete is to
 * drop the cached AI query results — every panel then refetches and reflects the
 * new part immediately. Query keys for these endpoints start with "/api/ai".
 */
export function invalidateAi(queryClient: QueryClient): void {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const first = query.queryKey?.[0];
      return typeof first === "string" && (first.startsWith("/api/ai") || first.startsWith("/api/stats"));
    },
  });
}
