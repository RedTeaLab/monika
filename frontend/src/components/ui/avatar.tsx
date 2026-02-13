import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const avatarVariants = cva(
  "inline-flex items-center justify-center rounded-full overflow-hidden",
  {
    variants: {
      size: {
        sm: "h-8 w-8 text-xs",
        md: "h-12 w-12 text-sm",
        lg: "h-16 w-16 text-base",
        xl: "h-24 w-24 text-lg",
        "2xl": "h-32 w-32 text-2xl",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
)

export interface AvatarProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof avatarVariants> {
  src?: string
  alt?: string
  fallback?: string
}

function Avatar({ className, size, src, alt, fallback, ...props }: AvatarProps) {
  const [imageError, setImageError] = React.useState(false)

  if (src && !imageError) {
    return (
      <div className={cn(avatarVariants({ size }), className)} {...props}>
        <img
          src={src}
          alt={alt || "Avatar"}
          className="h-full w-full object-cover"
          onError={() => setImageError(true)}
        />
      </div>
    )
  }

  return (
    <div className={cn(avatarVariants({ size }), className)} {...props}>
      <span className="font-semibold">{fallback || "?"}</span>
    </div>
  )
}

export { Avatar, avatarVariants }
