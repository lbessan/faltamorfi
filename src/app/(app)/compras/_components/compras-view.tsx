"use client";

import { useState } from "react";
import { ListChecks, ShoppingBasket } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { Location } from "@/lib/database.types";
import type { ProductWithLocation } from "@/lib/db/products";
import type { ShoppingListItemWithProduct } from "@/lib/db/shopping";
import { RestockView } from "./restock-view";
import { ShoppingListView } from "./shopping-list-view";

type Props = {
  restock: ProductWithLocation[];
  lowStock: ProductWithLocation[];
  productsInList: Set<string>;
  shoppingItems: ShoppingListItemWithProduct[];
  locations: Location[];
};

export function ComprasView({
  restock,
  lowStock,
  productsInList,
  shoppingItems,
  locations,
}: Props) {
  const pendingCount = shoppingItems.filter((i) => i.state === "pending").length;
  const checkedCount = shoppingItems.filter((i) => i.state === "checked").length;
  const totalListCount = pendingCount + checkedCount;

  // Por defecto: si hay items en la lista, abrir directo en Lista.
  const defaultTab = totalListCount > 0 ? "list" : "restock";
  const [tab, setTab] = useState<string>(defaultTab);

  return (
    <div className="px-4 py-4 space-y-4">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Compras
        </h1>
        <p className="text-sm text-muted-foreground">
          {totalListCount > 0
            ? `${totalListCount} en la lista${checkedCount > 0 ? ` · ${checkedCount} marcado${checkedCount === 1 ? "" : "s"}` : ""}`
            : "Lo que necesitás reponer y tu lista del super, todo en un lugar."}
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="restock">
            <ListChecks className="size-4" />
            Por reponer
            {restock.length + lowStock.length > 0 && (
              <span className="ml-1.5 text-[10px] text-muted-foreground">
                ({restock.length + lowStock.length})
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="list">
            <ShoppingBasket className="size-4" />
            Lista
            {totalListCount > 0 && (
              <span className="ml-1.5 text-[10px] text-muted-foreground">
                ({totalListCount})
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="restock" className="mt-4">
          <RestockView
            restock={restock}
            lowStock={lowStock}
            productsInList={productsInList}
            locations={locations}
          />
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          <ShoppingListView
            items={shoppingItems}
            locations={locations}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
