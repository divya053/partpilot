import { ReactNode } from "react";

export function Modal({
  title, onClose, children, footer, size,
}: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: "lg";
}) {
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className={`modal ${size === "lg" ? "lg" : ""}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
