import { componentRecipeOptions, type ComponentRecipeOption, type ComponentRecipeSelection, type SharedComponentId } from "./component-recipes";

export type MatrixFilters = { variant: string; tone: string; size: string };
export type MatrixState = {
  component: SharedComponentId;
  filters: MatrixFilters;
  observed: string | null;
  dismissed: string | null;
};
export const emptyMatrixFilters = (): MatrixFilters => ({ variant: "", tone: "", size: "" });
export const matrixSelectionKey = (selection: ComponentRecipeSelection | null) => selection
  ? [selection.component, selection.recipe, selection.part, selection.target].join("/") : null;
export const matchesMatrixFilters = (option: ComponentRecipeOption, filters: MatrixFilters) =>
  (!filters.variant || option.variant === filters.variant) && (!filters.tone || option.tone === filters.tone) && (!filters.size || option.size === filters.size);

export function createMatrixState(component: SharedComponentId, selection: ComponentRecipeSelection | null): MatrixState {
  return { component, filters: emptyMatrixFilters(), observed: matrixSelectionKey(selection), dismissed: null };
}

/** Reconcile only a genuinely new external target, never a pending local clear acknowledgement. */
export function reconcileMatrixSelection(state: MatrixState, component: SharedComponentId, selection: ComponentRecipeSelection | null): MatrixState {
  if (component !== state.component) return createMatrixState(component, selection);
  const observed = matrixSelectionKey(selection);
  if (observed === state.observed) return state;
  const option = selection?.component === component ? componentRecipeOptions(component).find(option => option.key === selection.recipe) : undefined;
  const filters = { ...state.filters };
  if (option) for (const axis of ["variant", "tone", "size"] as const) {
    if (filters[axis] && filters[axis] !== option[axis]) filters[axis] = "";
  }
  return { ...state, filters, observed, dismissed: null };
}

export function changeMatrixFilters(state: MatrixState, filters: MatrixFilters, selection: ComponentRecipeSelection | null): { state: MatrixState; clear: boolean } {
  const key = matrixSelectionKey(selection);
  const option = selection?.component === state.component ? componentRecipeOptions(state.component).find(option => option.key === selection.recipe) : undefined;
  const clear = !!option && !matchesMatrixFilters(option, filters) && state.dismissed !== key;
  return { state: { ...state, filters, dismissed: clear ? key : state.dismissed }, clear };
}

/** Run on body mount and after updates, before paint; design samples are not keyboard controls. */
export function disableMatrixBodyTabStops(body: HTMLElement | null) {
  if (!body) return;
  for (const element of body.querySelectorAll<HTMLElement>("a, button, input, select, textarea, [tabindex], [contenteditable], audio[controls], video[controls], summary")) element.tabIndex = -1;
}
