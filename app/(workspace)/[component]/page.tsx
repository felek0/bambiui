import { componentIds } from "../../studio/tokens";
import { foundationIds } from "../../studio/foundations";

export const dynamicParams = false;

export function generateStaticParams() {
  return [...componentIds, ...foundationIds].map((component) => ({ component }));
}

export default function ComponentDesignPage() {
  return null;
}
