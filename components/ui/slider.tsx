"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface SliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value?: number[]
  onValueChange?: (value: number[]) => void
  onChange?: React.ChangeEventHandler<HTMLInputElement>
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value, onValueChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(e.target.value)
      onValueChange?.([newValue])
      props.onChange?.(e)
    }

    return (
      <input
        type="range"
        ref={ref}
        value={value?.[0] ?? 0}
        onChange={handleChange}
        className={cn(
          "w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer slider",
          "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer",
          "[&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0",
          className
        )}
        {...props}
      />
    )
  }
)

Slider.displayName = "Slider"

export { Slider }

