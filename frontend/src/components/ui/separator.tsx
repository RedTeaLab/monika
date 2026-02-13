import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const separatorVariants = cva("shrink-0 bg-border", {
  variants: {
    orientation: {
      horizontal: "h-[1px] w-full",
      vertical: "h-full w-[1px]",
    },
    decorative: {
      true: "border-0",
      false: "",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
    decorative: true,
  },
})

export interface SeparatorProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof separatorVariants> {}

function Separator({
  className,
  orientation,
  decorative,
  ...props
}: SeparatorProps) {
  return (
    <div
      role={decorative === false ? "separator" : undefined}
      aria-orientation={orientation as "horizontal" | "vertical"}
      className={cn(separatorVariants({ orientation, decorative }), className)}
      {...props}
    ></div>
  )
}

export { Separator }
