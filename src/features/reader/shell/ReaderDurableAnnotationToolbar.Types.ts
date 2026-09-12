export type DurableAnnotationToolbarItem = {
  id: string;
  mode: "editable" | "readonly";
  quoteText?: string;
  note?: string;
  color?: string;
};

export type DurableAnnotationToolbarPosition = {
  left: number;
  top: number;
  placement: "above" | "below" | "left" | "right";
};
