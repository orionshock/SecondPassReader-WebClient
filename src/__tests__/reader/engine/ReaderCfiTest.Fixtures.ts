export const readerCfi = {
  point: "epubcfi(/6/12)",
  alternatePoint: "epubcfi(/6/18)",
  range: "epubcfi(/6/12!/4/2,/1:0,/1:8)",
  malformed: "not-a-cfi",
} as const;

export const bootstrapRestoreTransition = {
  generation: 7,
  restoreCfi: "epubcfi(/6/76)",
  layoutCfi: "epubcfi(/6/38)",
  navigatedCfi: "epubcfi(/6/100)",
} as const;
