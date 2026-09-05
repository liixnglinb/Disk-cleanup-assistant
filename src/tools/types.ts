export interface ToolMeta {
  id: string;
  name: string;
  description: string;
  icon: string;
  version: string;
  /** set true when backend /api/tools reports it as enabled */
  enabled?: boolean;
  builtin?: boolean;
}

export interface ToolEntry {
  meta: ToolMeta;
  component: React.LazyExoticComponent<React.ComponentType<any>>;
}
