import type { ReactNode } from "react";

export function PageHeading({
  kicker,
  title,
  accent,
  description,
  action,
}: {
  kicker: string;
  title: string;
  accent?: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow"><span className="eyebrow-dot" />{kicker}</p>
        <h1>{title}{accent && <> <span>{accent}</span></>}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action && <div className="heading-action">{action}</div>}
    </div>
  );
}
