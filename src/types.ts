export interface InputData {
  meta: Meta
  classes: ClassNode[]
  edges: Edge[]
  warnings?: Warning[]
}

export interface Meta {
  version: string
  generated_at: string
  analyzed_path: string
  file_count: number
  class_count: number
  node_count: number
  edge_count: number
  warning_count: number
}

export interface ClassNode {
  fqcn: string
  type: 'class' | 'interface' | 'trait' | 'enum'
  file: string
  line: number
  dependencies: string[]
  dependants: string[]
}

export interface Edge {
  source: string
  target: string
  type: string
  confidence: 'certain' | 'high' | 'medium' | 'low'
  file: string
  line: number
  metadata: Record<string, unknown>
}

export interface Warning {
  type: string
  file: string
  line: number
  message: string
}
