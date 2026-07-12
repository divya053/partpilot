import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  useAskAiAssistant,
  type AiChatMessage,
  type GetAiInsightsScope,
} from "@workspace/api-client-react";
import { Sparkles, X, SendHorizontal, Bot, Loader2, Plus, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Map the current route to an insight/assistant scope so answers stay relevant. */
function scopeFromLocation(location: string): GetAiInsightsScope {
  if (location === "/" || location === "") return "dashboard";
  if (location.startsWith("/builder")) return "builder";
  if (location.startsWith("/segments")) return "segments";
  if (/^\/library\/\d+/.test(location)) return "part";
  if (location.startsWith("/library")) return "library";
  return "global";
}

function welcomeSuggestions(scope: GetAiInsightsScope): string[] {
  switch (scope) {
    case "builder":
      return [
        "Generate a part number for a 150W UFO High Bay",
        "What does CCT mean in the part number?",
        "What finish is most common for UHB?",
      ];
    case "segments":
      return [
        "Which segment codes are never used?",
        "What does the CCT segment mean?",
        "How do applicable products work?",
      ];
    case "part":
      return [
        "Explain this part number",
        "Are there similar parts?",
        "Is anything wrong with this record?",
      ];
    case "library":
      return [
        "What should I clean up?",
        "How many drafts are pending?",
        "Which category has the most parts?",
      ];
    default:
      return [
        "Generate a part number for a 150W UFO High Bay",
        "What does CCT mean in the part number?",
        "Show me all selectable wattage parts",
      ];
  }
}

interface ChatEntry {
  role: "user" | "assistant";
  content: string;
}

export function AssistantDock() {
  const [location] = useLocation();
  const scope = scopeFromLocation(location);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [notConfigured, setNotConfigured] = useState(false);

  const { mutateAsync, isPending } = useAskAiAssistant();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isPending, open]);

  const newChat = () => {
    setMessages([]);
    setSuggestions([]);
    setNotConfigured(false);
    setInput("");
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isPending) return;

    const history: AiChatMessage[] = messages.slice(-8).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");

    try {
      const result = await mutateAsync({ data: { message: trimmed, scope, history } });
      setMessages((prev) => [...prev, { role: "assistant", content: result.reply }]);
      setSuggestions(result.suggestions ?? []);
      setNotConfigured(!result.aiConfigured);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry — I couldn't reach the assistant. Make sure the API server is running and an AI key is configured.",
        },
      ]);
    }
  };

  const followups = suggestions.length > 0 ? suggestions : welcomeSuggestions(scope);
  const empty = messages.length === 0 && !isPending;

  return (
    <>
      {/* Launcher */}
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 active:scale-95"
          aria-label="Open PartPilot assistant"
        >
          <Sparkles className="h-5 w-5" />
          <span className="text-sm font-semibold">Ask PartPilot</span>
        </button>
      ) : null}

      {/* Right-docked full-height panel */}
      {open ? (
        <aside className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl animate-in slide-in-from-right-8 fade-in duration-200 sm:w-[400px]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-violet-500 text-white shadow-sm">
                <Bot className="h-[18px] w-[18px]" />
              </div>
              <span className="text-[15px] font-semibold">PartPilot Assistant</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-sidebar-foreground/70 hover:bg-white/10 hover:text-white"
                onClick={newChat}
                title="New chat"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-sidebar-foreground/70 hover:bg-white/10 hover:text-white"
                onClick={() => setOpen(false)}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Body */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
            {empty ? (
              <div className="flex h-full flex-col">
                <div className="flex flex-1 flex-col items-center justify-center px-2 text-center">
                  <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary/30 to-violet-500/20 text-primary ring-1 ring-white/10">
                    <Bot className="h-8 w-8" />
                  </div>
                  <h3 className="text-lg font-semibold text-sidebar-foreground">How can I help?</h3>
                  <p className="mt-2 max-w-[16rem] text-sm leading-6 text-sidebar-foreground/60">
                    I can decode part numbers, explain configurations, and help you navigate the portal —
                    grounded in your live registry data.
                  </p>
                </div>

                <div className="space-y-2">
                  {welcomeSuggestions(scope).map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm text-sidebar-foreground/90 transition-colors hover:border-primary/40 hover:bg-white/[0.06]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={cn("flex gap-2.5", m.role === "user" ? "flex-row-reverse" : "flex-row")}
                  >
                    <div
                      className={cn(
                        "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full",
                        m.role === "user" ? "bg-white/10" : "bg-gradient-to-br from-primary to-violet-500",
                      )}
                    >
                      {m.role === "user" ? (
                        <User className="h-3.5 w-3.5 text-sidebar-foreground" />
                      ) : (
                        <Bot className="h-3.5 w-3.5 text-white" />
                      )}
                    </div>
                    <div
                      className={cn(
                        "max-w-[82%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-6",
                        m.role === "user"
                          ? "rounded-tr-sm bg-primary text-primary-foreground"
                          : "rounded-tl-sm bg-white/[0.06] text-sidebar-foreground",
                      )}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}

                {isPending ? (
                  <div className="flex gap-2.5">
                    <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-violet-500">
                      <Bot className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-white/[0.06] px-3.5 py-2.5 text-sm text-sidebar-foreground/70">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Thinking…
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Follow-up chips (after first exchange) */}
          {!empty && !isPending ? (
            <div className="flex flex-wrap gap-1.5 px-4 pb-1 pt-2">
              {followups.slice(0, 3).map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-sidebar-foreground/70 transition-colors hover:border-primary/40 hover:text-sidebar-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          {notConfigured ? (
            <p className="px-4 pt-2 text-[11px] leading-5 text-amber-400">
              Add a free GROQ_API_KEY to the API server for full AI chat. Live data answers still work.
            </p>
          ) : null}

          {/* Composer */}
          <form
            className="border-t border-sidebar-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-2 focus-within:border-primary/40">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  // Cmd/Ctrl+Enter sends; plain Enter also sends unless Shift is held.
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                rows={1}
                placeholder="Ask PartPilot… (Cmd+Enter to send)"
                className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/40"
              />
              <Button
                type="submit"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-lg"
                disabled={isPending || !input.trim()}
              >
                <SendHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </aside>
      ) : null}
    </>
  );
}
