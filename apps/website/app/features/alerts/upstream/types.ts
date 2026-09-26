export interface CalloutDefinition {
  title: string
  indicator: string
}

export type DefaultCallouts = Record<string, CalloutDefinition>
