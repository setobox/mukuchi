export interface ResourceLink {
  title: string
  description: string
  href: string
  imageUrl?: string
}

export interface ResourceGroup {
  title: string
  items: ResourceLink[]
}
