"use client";

import { useState } from "react";
import Link from "next/link";
import { ListChecks, ReceiptText, ShoppingBasket } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { ProductWithLots } from "@/lib/db/products";
import type { ConsumptionRate } from "@/lib/db/predictions";
import type { ShoppingListItemWithProduct } from "@/lib/db/shopping";
import { useRealtimeRefresh } from "@/lib/realtime/use-realtime-refresh";
import { RestockView } from "./restock-view";
import { ShoppingListView } from "./shopping-list-view";

type Props = {
  householdId: string;
  restock: ProductWithLots[];
  lowStock: ProductWithLots[];
  runningOut: ProductWithLots[];
  productsInList: Set<string>;
  shoppingItems: ShoppingListItemWithProduct[];
  canEdit: boolean;
  ratesByProduct: Record<string, ConsumptionRate>;
};

export function ComprasView({
  householdId,
  restock,
  lowStock,
  runningOut,
  productsInList,
  shoppingItems,
  canEdit,
  ratesByProduct,
}: Props) {
  // Sync entre miembros: cuando otro agrega/checkea/quita items o cambia
  // stock que afecta a "Por reponer", refrescamos.
  useRealtimeRefresh({
    tables: [
      {
        table: "shopping_list_items",
        filter: `household_id=eq.${householdId}`,
      },
      { table: "products", filter: `household_id=eq.${householdId}` },
      { table: "stock_items" },
    ],
  });

  const pendingCount = shoppingItems.filter((i) => i.state === "pending").length;
  const checkedCount = shoppingItems.filter((i) => i.state === "checked").length;
  const totalListCount = pendingCount + checkedCount;

  // Por defecto: si hay items en la lista, abrir directo en Lista.
  const defaultTab = totalListCount > 0 ? "list" : "restock";
  const [tab, setTab] = useState<string>(defaultTab);

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            Compras
          </h1>
          <p className="text-sm text-muted-foreground">
            {totalListCount > 0
              ? `${totalListCount} en la lista${checkedCount > 0 ? ` · ${checkedCount} marcado${checkedCount === 1 ? "" : "s"}` : ""}`
              : "Lo que necesitás reponer y tu lista del super, todo en un lugar."}
          </p>
        </div>
        {canEdit && (
          <Link
            href="/compras/ticket"
            aria-label="Cargar desde ticket"
            title="Cargar desde ticket"
            className={buttonVariants({ variant: "outline", size: "icon" }) + " shrink-0 size-11"}
          >
            <ReceiptText className="size-5" />
          </Link>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="restock">
            <ListChecks className="size-4" />
            Por reponer
            {restock.length + lowStock.length + runningOut.length > 0 && (
              <span className="ml-1.5 text-[10px] text-muted-foreground">
                ({restock.length + lowStock.length + runningOut.length})
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
            runningOut={runningOut}
            productsInList={productsInList}
            canEdit={canEdit}
            ratesByProduct={ratesByProduct}
          />
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          <ShoppingListView items={shoppingItems} canEdit={canEdit} />
        </TabsContent>
      </Tabs>

      {!canEdit && (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Estás en modo solo lectura. Para modificar la lista o cargar
          productos pedile al dueño del hogar que te cambie el rol.
        </div>
      )}
    </div>
  );
}
