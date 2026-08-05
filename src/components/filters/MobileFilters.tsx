"use client";

import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { FilterSidebar } from "./FilterSidebar";

export function MobileFilters({
  counties,
  visibleSubCount,
  totalSubCount,
}: {
  counties: string[];
  visibleSubCount: number;
  totalSubCount: number;
}) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button size="sm" variant="outline" className="md:hidden">
            <SlidersHorizontal className="size-3.5" />
            Filters
          </Button>
        }
      />
      <SheetContent side="left" className="w-[300px] p-0 sm:max-w-[300px]">
        <SheetHeader className="sr-only">
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <FilterSidebar
          counties={counties}
          visibleSubCount={visibleSubCount}
          totalSubCount={totalSubCount}
        />
      </SheetContent>
    </Sheet>
  );
}
