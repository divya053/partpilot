import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

type Help = { emoji: string; title: string; body: string; steps?: string[] };

// Plain-English "what is this page & what do I do" guidance, shown at the top of
// every page so a first-time user understands it without any training. Keyed by
// route (most-specific prefix wins). Pages that already carry their own rich
// explainer (Units & Values, Model Config) are intentionally omitted.
const HELP: { match: (p: string) => boolean; help: Help }[] = [
  { match: (p) => p === "/", help: {
    emoji: "👋", title: "Welcome to PartPilot",
    body: "This is your home base. See your totals at a glance, then jump straight into building a part number or browsing everything you've saved.",
    steps: ["Click a stat or “Build a Part Number” to start", "Everything you create shows up in the Library"],
  } },
  { match: (p) => p.startsWith("/builder"), help: {
    emoji: "🛠️", title: "Build a part number, step by step",
    body: "Pick an option in each dropdown and the code assembles live on the right. In a hurry? Type a plain-English description (or chat with the AI agent) and it fills the form for you.",
    steps: ["Choose the Product Model first — the other lists filter to fit it", "Fill each dropdown (⭐ shows the most-used choice)", "Add product details, then Save Part Number"],
  } },
  { match: (p) => p.startsWith("/library"), help: {
    emoji: "📚", title: "Your part number library",
    body: "Every saved part number lives here. Search or filter to find one, click a row to open it, or tick several rows to update or delete them together.",
    steps: ["Click a part number to view/edit it", "Tick rows → use the green bar to change many at once", "Export to Excel, or Import to bulk-add"],
  } },
  { match: (p) => p.startsWith("/part"), help: {
    emoji: "🔎", title: "Part number details",
    body: "The full breakdown of one part number — what each part of the code means, its product info and spec sheets.",
  } },
  { match: (p) => p.startsWith("/companies"), help: {
    emoji: "🏢", title: "Companies",
    body: "Your customers, distributors and partners. Add or edit a company, click any cell to edit it inline, or import a whole list from Excel.",
    steps: ["Click a cell to edit it right in the table", "Tick rows to update or delete several at once"],
  } },
  { match: (p) => p.startsWith("/products"), help: {
    emoji: "📦", title: "Products",
    body: "The product families behind your part numbers. Each has a short model code (e.g. UHB = UFO High Bay) that the builder uses.",
    steps: ["Add a product with its model code", "Pick it in the builder to auto-fill the model"],
  } },
  { match: (p) => p.startsWith("/categories"), help: {
    emoji: "🏷️", title: "Categories",
    body: "Simple labels used to group your part numbers (High Bay, Downlight, Wallpack…). Edit inline or import from Excel.",
  } },
  { match: (p) => p.startsWith("/attributes"), help: {
    emoji: "🧩", title: "Attributes — the parts of a part number",
    body: "These are the segments that make up every code, in order (Company, Model, CCT, Finish…). Rename or describe them here; edit their actual values in Units & Values.",
  } },
  { match: (p) => p.startsWith("/templates"), help: {
    emoji: "📐", title: "Templates",
    body: "Preset layouts that pre-pick which segments to show, so common part numbers are faster to build.",
  } },
  { match: (p) => p.startsWith("/reports"), help: {
    emoji: "📊", title: "Reports",
    body: "Charts and breakdowns of your part numbers — by status, category and series — so you can spot trends at a glance.",
  } },
  { match: (p) => p.startsWith("/audit"), help: {
    emoji: "🕓", title: "Audit log",
    body: "A running history of every change — who did what, and when. Filter by the kind of change to trace something.",
  } },
  { match: (p) => p.startsWith("/import-export"), help: {
    emoji: "🔄", title: "Import / Export",
    body: "Move data in and out in bulk. Download a template, edit it in Excel, and upload — or export what you have.",
  } },
  { match: (p) => p.startsWith("/users"), help: {
    emoji: "👥", title: "User management",
    body: "Who can sign in and what they're allowed to do. Master can manage everything; creators build; viewers only look.",
  } },
];

function helpFor(pathname: string): Help | null {
  return HELP.find((h) => h.match(pathname))?.help ?? null;
}

export function PageHelp() {
  const { pathname } = useLocation();
  const help = helpFor(pathname);
  const storeKey = `help_${pathname.split("/").slice(0, 2).join("/")}`;
  const [open, setOpen] = useState(true);

  useEffect(() => { setOpen(localStorage.getItem(storeKey) !== "closed"); }, [storeKey]);

  if (!help) return null;

  const dismiss = () => { setOpen(false); try { localStorage.setItem(storeKey, "closed"); } catch { /* ignore */ } };
  const reopen = () => { setOpen(true); try { localStorage.removeItem(storeKey); } catch { /* ignore */ } };

  if (!open) {
    return (
      <button className="help-reopen" onClick={reopen} title="Show a quick explanation of this page">
        {help.emoji} What is this page?
      </button>
    );
  }

  return (
    <div className="page-help">
      <div className="page-help-emoji">{help.emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="page-help-title">{help.title}</div>
        <div className="page-help-body">{help.body}</div>
        {help.steps && (
          <ol className="page-help-steps">
            {help.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        )}
      </div>
      <button className="page-help-x" onClick={dismiss} aria-label="Dismiss" title="Got it — hide this">✕</button>
    </div>
  );
}
