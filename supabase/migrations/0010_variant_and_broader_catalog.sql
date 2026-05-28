-- ============================================================================
-- Falta Morfi — Fase 10 (catálogo más amplio + variante en lote)
--
-- Cambios:
--   1. Nueva columna `variant` (text, nullable) en stock_items. Permite que
--      un mismo "tipo" tenga sabores/cortes/subtipos en cada lote sin tener
--      que crear N productos casi iguales. Ejemplos:
--        - Galletitas + variant: "chips de chocolate" / "rellenas" / "saladas"
--        - Té + variant: "negro" / "verde" / "manzanilla"
--        - Fideos + variant: "tallarines" / "spaghetti" / "moñitos"
--   2. Re-curado del catálogo seed: los tipos pasan a ser más amplios
--      (Galletitas, Pan, Té, Fideos, Vino, Cerveza, etc.) y los subtipos
--      específicos viajan en variant + brand a nivel de lote.
--   3. Borramos los productos existentes y re-sembramos a todos los hogares.
--      Pre-launch: el usuario aceptó perder los datos cargados.
--
-- Idempotente: corre múltiples veces sin error.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Columna variant en stock_items
-- ----------------------------------------------------------------------------

alter table public.stock_items
  add column if not exists variant text;


-- ----------------------------------------------------------------------------
-- 2) Reset de productos existentes
-- ----------------------------------------------------------------------------

-- Borrar todos los productos. Cascadeo borra stock_items y consumption_log.
-- Los shopping_list_items quedan con product_id=null (item suelto).
delete from public.products;


-- ----------------------------------------------------------------------------
-- 3) Catálogo curado nuevo (tipos amplios)
-- ----------------------------------------------------------------------------

create or replace function public.seed_catalog_for_household(target_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with catalog(name, department, icon, unit, threshold) as (
    values
      -- ===== Lácteos =====
      ('Leche',                 'dairy',   'Milk',          'un', 2),
      ('Yogur',                 'dairy',   'Milk',          'un', 4),
      ('Postre lácteo',         'dairy',   'IceCream',      'un', 4),
      ('Crema de leche',        'dairy',   'Milk',          'un', 1),
      ('Manteca',               'dairy',   'Butter',        'un', 1),
      ('Queso',                 'dairy',   'Cookie',        'un', 1),
      ('Mozzarella',            'dairy',   'Cookie',        'un', 1),
      ('Dulce de leche',        'dairy',   'Cookie',        'un', 1),
      ('Ricota',                'dairy',   'Cookie',        'un', 1),

      -- ===== Carnicería =====
      ('Carne vacuna',          'meat',    'Beef',          'kg', 1),
      ('Carne picada',          'meat',    'Beef',          'kg', 1),
      ('Pollo',                 'meat',    'Drumstick',     'kg', 1),
      ('Carne de cerdo',        'meat',    'Beef',          'kg', 1),
      ('Cordero',               'meat',    'Beef',          'kg', 1),

      -- ===== Pescadería =====
      ('Pescado fresco',        'fish',    'Fish',          'kg', 1),
      ('Mariscos',              'fish',    'Fish',          'kg', 1),

      -- ===== Fiambres =====
      ('Jamón',                 'deli',    'Ham',           'g',  200),
      ('Salame',                'deli',    'Ham',           'g',  100),
      ('Mortadela',             'deli',    'Ham',           'g',  200),
      ('Bondiola',              'deli',    'Ham',           'g',  100),
      ('Chorizo',               'deli',    'Beef',          'un', 4),
      ('Morcilla',              'deli',    'Beef',          'un', 2),
      ('Panceta',               'deli',    'Ham',           'g',  100),
      ('Salchichas',            'deli',    'Ham',           'un', 6),

      -- ===== Panadería =====
      ('Pan',                   'bakery',  'Sandwich',      'un', 1),
      ('Pan rallado',           'bakery',  'Croissant',     'paq', 1),
      ('Galletitas',            'bakery',  'Cookie',        'paq', 2),
      ('Tostadas',              'bakery',  'Sandwich',      'paq', 1),
      ('Facturas',              'bakery',  'Croissant',     'un', 6),
      ('Medialunas',            'bakery',  'Croissant',     'un', 6),

      -- ===== Almacén =====
      ('Fideos',                'pantry',  'Wheat',         'paq', 2),
      ('Pasta rellena',         'pantry',  'Wheat',         'paq', 1),
      ('Arroz',                 'pantry',  'Wheat',         'kg', 1),
      ('Legumbres',             'pantry',  'Bean',          'paq', 1),
      ('Harina',                'pantry',  'Wheat',         'kg', 1),
      ('Polenta',               'pantry',  'Wheat',         'paq', 1),
      ('Avena',                 'pantry',  'Wheat',         'paq', 1),
      ('Maicena',               'pantry',  'Wheat',         'paq', 1),
      ('Sémola',                'pantry',  'Wheat',         'paq', 1),

      -- ===== Condimentos y salsas =====
      ('Aceite',                'condiments', 'Droplet',    'l',  1),
      ('Vinagre',               'condiments', 'Droplet',    'l',  1),
      ('Salsa de tomate',       'condiments', 'Soup',       'un', 2),
      ('Puré de tomate',        'condiments', 'Soup',       'un', 2),
      ('Tomate triturado',      'condiments', 'Soup',       'un', 2),
      ('Ketchup',               'condiments', 'Soup',       'un', 1),
      ('Mayonesa',              'condiments', 'Soup',       'un', 1),
      ('Mostaza',               'condiments', 'Soup',       'un', 1),
      ('Salsa golf',            'condiments', 'Soup',       'un', 1),
      ('Salsa de soja',         'condiments', 'Soup',       'un', 1),
      ('Sal',                   'condiments', 'Soup',       'paq', 1),
      ('Pimienta',              'condiments', 'Soup',       'un', 1),
      ('Pimentón',              'condiments', 'Soup',       'un', 1),
      ('Ají molido',            'condiments', 'Soup',       'un', 1),
      ('Orégano',               'condiments', 'Leaf',       'un', 1),
      ('Comino',                'condiments', 'Soup',       'un', 1),
      ('Laurel',                'condiments', 'Leaf',       'un', 1),
      ('Hierbas aromáticas',    'condiments', 'Leaf',       'un', 1),
      ('Curry',                 'condiments', 'Soup',       'un', 1),
      ('Canela',                'condiments', 'Soup',       'un', 1),
      ('Vainilla',              'condiments', 'Soup',       'un', 1),
      ('Caldo',                 'condiments', 'Soup',       'un', 1),

      -- ===== Conservas =====
      ('Atún en lata',          'canned',  'Fish',          'un', 4),
      ('Sardinas en lata',      'canned',  'Fish',          'un', 2),
      ('Caballa en lata',       'canned',  'Fish',          'un', 2),
      ('Choclo en lata',        'canned',  'Wheat',         'un', 4),
      ('Arvejas en lata',       'canned',  'Bean',          'un', 2),
      ('Legumbres en lata',     'canned',  'Bean',          'un', 2),
      ('Palmitos',              'canned',  'Leaf',          'un', 2),
      ('Aceitunas',             'canned',  'Cherry',        'un', 2),
      ('Pickles',               'canned',  'Carrot',        'un', 1),
      ('Frutas en almíbar',     'canned',  'Apple',         'un', 1),
      ('Leche condensada',      'canned',  'Milk',          'un', 1),

      -- ===== Frutas y verduras =====
      ('Tomate',                'produce', 'Cherry',        'kg', 1),
      ('Cebolla',               'produce', 'Carrot',        'kg', 1),
      ('Papa',                  'produce', 'Carrot',        'kg', 2),
      ('Batata',                'produce', 'Carrot',        'kg', 1),
      ('Zanahoria',             'produce', 'Carrot',        'kg', 1),
      ('Calabaza',              'produce', 'Carrot',        'un', 1),
      ('Zapallito',             'produce', 'Carrot',        'un', 4),
      ('Berenjena',             'produce', 'Carrot',        'un', 2),
      ('Morrón',                'produce', 'Apple',         'un', 2),
      ('Pepino',                'produce', 'Carrot',        'un', 2),
      ('Apio',                  'produce', 'Leaf',          'un', 1),
      ('Puerro',                'produce', 'Leaf',          'un', 2),
      ('Ajo',                   'produce', 'Carrot',        'un', 4),
      ('Jengibre',              'produce', 'Carrot',        'un', 1),
      ('Lechuga',               'produce', 'Salad',         'un', 1),
      ('Rúcula',                'produce', 'Salad',         'un', 1),
      ('Espinaca',              'produce', 'Salad',         'un', 1),
      ('Acelga',                'produce', 'Salad',         'un', 1),
      ('Repollo',               'produce', 'Salad',         'un', 1),
      ('Brócoli',               'produce', 'Salad',         'un', 1),
      ('Coliflor',              'produce', 'Salad',         'un', 1),
      ('Choclo fresco',         'produce', 'Wheat',         'un', 4),
      ('Champiñones',           'produce', 'Carrot',        'un', 1),
      ('Manzana',               'produce', 'Apple',         'kg', 1),
      ('Banana',                'produce', 'Banana',        'kg', 1),
      ('Pera',                  'produce', 'Apple',         'kg', 1),
      ('Naranja',               'produce', 'Citrus',        'kg', 1),
      ('Mandarina',             'produce', 'Citrus',        'kg', 1),
      ('Limón',                 'produce', 'Citrus',        'un', 4),
      ('Frutilla',              'produce', 'Cherry',        'un', 1),
      ('Palta',                 'produce', 'Apple',         'un', 2),
      ('Uva',                   'produce', 'Grape',         'kg', 1),

      -- ===== Bebidas sin alcohol =====
      ('Agua mineral',          'beverages', 'GlassWater',  'un', 4),
      ('Agua saborizada',       'beverages', 'GlassWater',  'un', 2),
      ('Gaseosa',               'beverages', 'CupSoda',     'un', 2),
      ('Jugo',                  'beverages', 'CupSoda',     'un', 2),
      ('Bebida isotónica',      'beverages', 'CupSoda',     'un', 2),
      ('Energizante',           'beverages', 'CupSoda',     'un', 2),

      -- ===== Bebidas alcohólicas =====
      ('Cerveza',               'alcohol', 'Beer',          'un', 6),
      ('Vino',                  'alcohol', 'Wine',          'un', 2),
      ('Espumante',             'alcohol', 'Wine',          'un', 1),
      ('Fernet',                'alcohol', 'Wine',          'un', 1),
      ('Whisky',                'alcohol', 'Wine',          'un', 1),
      ('Aperitivo',             'alcohol', 'Wine',          'un', 1),

      -- ===== Desayuno e infusiones =====
      ('Café',                  'breakfast', 'Coffee',      'un', 1),
      ('Té',                    'breakfast', 'Coffee',      'un', 2),
      ('Mate cocido',           'breakfast', 'Coffee',      'un', 1),
      ('Yerba',                 'breakfast', 'Coffee',      'kg', 1),
      ('Cacao en polvo',        'breakfast', 'Coffee',      'un', 1),
      ('Cereales',              'breakfast', 'Wheat',       'un', 2),
      ('Granola',               'breakfast', 'Wheat',       'un', 1),
      ('Barras de cereal',      'breakfast', 'Cookie',      'paq', 2),
      ('Mermelada',             'breakfast', 'Cherry',      'un', 2),
      ('Miel',                  'breakfast', 'Cookie',      'un', 1),

      -- ===== Snacks y golosinas =====
      ('Papas fritas',          'snacks',  'Cookie',        'paq', 2),
      ('Maní',                  'snacks',  'Bean',          'un', 2),
      ('Almendras',             'snacks',  'Bean',          'un', 1),
      ('Nueces',                'snacks',  'Bean',          'un', 1),
      ('Pasas de uva',          'snacks',  'Grape',         'un', 1),
      ('Frutos secos mixtos',   'snacks',  'Bean',          'un', 1),
      ('Snacks salados',        'snacks',  'Cookie',        'paq', 2),
      ('Chicles',               'snacks',  'Candy',         'un', 2),
      ('Caramelos',             'snacks',  'Candy',         'paq', 2),
      ('Chocolate',             'snacks',  'Candy',         'un', 2),
      ('Alfajores',             'snacks',  'Candy',         'un', 4),
      ('Bombones',              'snacks',  'Candy',         'un', 1),
      ('Turrón',                'snacks',  'Candy',         'un', 1),

      -- ===== Congelados =====
      ('Pizza congelada',       'frozen',  'Pizza',         'un', 2),
      ('Empanadas congeladas',  'frozen',  'Snowflake',     'un', 12),
      ('Hamburguesas congeladas','frozen', 'Snowflake',     'un', 4),
      ('Milanesas congeladas',  'frozen',  'Snowflake',     'un', 4),
      ('Nuggets de pollo',      'frozen',  'Drumstick',     'un', 2),
      ('Papas fritas congeladas','frozen','Snowflake',      'paq', 2),
      ('Bastones de muzzarella','frozen',  'Snowflake',     'paq', 1),
      ('Verduras congeladas',   'frozen',  'Snowflake',     'paq', 2),
      ('Frutos rojos congelados','frozen', 'Snowflake',     'paq', 1),
      ('Helado',                'frozen',  'IceCream',      'un', 1),
      ('Pescado congelado',     'frozen',  'Fish',          'un', 1),
      ('Tapas de empanada',     'frozen',  'Snowflake',     'paq', 1),
      ('Tapas de tarta',        'frozen',  'Snowflake',     'paq', 1),

      -- ===== Limpieza =====
      ('Detergente para vajilla','cleaning','SprayCan',     'l',  1),
      ('Lavandina',             'cleaning','SprayCan',      'l',  1),
      ('Limpiapisos',           'cleaning','SprayCan',      'l',  1),
      ('Limpiavidrios',         'cleaning','SprayCan',      'un', 1),
      ('Limpiador multiuso',    'cleaning','SprayCan',      'un', 1),
      ('Limpia baño',           'cleaning','SprayCan',      'un', 1),
      ('Limpia inodoro',        'cleaning','SprayCan',      'un', 1),
      ('Desinfectante',         'cleaning','SprayCan',      'un', 1),
      ('Desengrasante',         'cleaning','SprayCan',      'un', 1),
      ('Lustramuebles',         'cleaning','SprayCan',      'un', 1),
      ('Insecticida',           'cleaning','SprayCan',      'un', 1),
      ('Aromatizador',          'cleaning','SprayCan',      'un', 1),
      ('Jabón en polvo',        'cleaning','SprayCan',      'kg', 1),
      ('Jabón líquido para ropa','cleaning','SprayCan',     'l',  1),
      ('Suavizante para ropa',  'cleaning','SprayCan',      'l',  1),
      ('Quitamanchas',          'cleaning','SprayCan',      'un', 1),
      ('Esponjas',              'cleaning','Brush',         'un', 2),
      ('Trapos de limpieza',    'cleaning','Brush',         'un', 2),
      ('Bolsas de residuos',    'cleaning','Trash2',        'un', 1),
      ('Papel film',            'cleaning','Package',       'un', 1),
      ('Papel aluminio',        'cleaning','Package',       'un', 1),
      ('Servilletas',           'cleaning','Package',       'un', 2),

      -- ===== Baño y perfumería =====
      ('Papel higiénico',       'personal_care','ShowerHead','un', 4),
      ('Pañuelos descartables', 'personal_care','ShowerHead','un', 2),
      ('Pasta dental',          'personal_care','ShowerHead','un', 1),
      ('Cepillo de dientes',    'personal_care','ShowerHead','un', 1),
      ('Enjuague bucal',        'personal_care','ShowerHead','un', 1),
      ('Hilo dental',           'personal_care','ShowerHead','un', 1),
      ('Champú',                'personal_care','ShowerHead','un', 1),
      ('Acondicionador',        'personal_care','ShowerHead','un', 1),
      ('Jabón de tocador',      'personal_care','ShowerHead','un', 4),
      ('Jabón líquido para manos','personal_care','ShowerHead','un', 1),
      ('Crema corporal',        'personal_care','ShowerHead','un', 1),
      ('Crema facial',          'personal_care','ShowerHead','un', 1),
      ('Crema para manos',      'personal_care','ShowerHead','un', 1),
      ('Protector solar',       'personal_care','Sun',       'un', 1),
      ('Desodorante',           'personal_care','SprayCan',  'un', 1),
      ('Talco',                 'personal_care','ShowerHead','un', 1),
      ('Espuma de afeitar',     'personal_care','SprayCan',  'un', 1),
      ('Hojitas de afeitar',    'personal_care','ShowerHead','un', 1),
      ('Maquinitas descartables','personal_care','ShowerHead','un', 1),
      ('Toallas femeninas',     'personal_care','ShowerHead','un', 1),
      ('Tampones',              'personal_care','ShowerHead','un', 1),
      ('Algodón',               'personal_care','ShowerHead','un', 1),
      ('Hisopos',               'personal_care','ShowerHead','un', 1),
      ('Rollo de cocina',       'personal_care','Package',   'un', 2),

      -- ===== Botiquín =====
      ('Aspirina',              'pharmacy','Pill',          'un', 1),
      ('Ibuprofeno',            'pharmacy','Pill',          'un', 1),
      ('Paracetamol',           'pharmacy','Pill',          'un', 1),
      ('Curitas',               'pharmacy','Bandage',       'un', 1),
      ('Vendas',                'pharmacy','Bandage',       'un', 1),
      ('Gasas',                 'pharmacy','Bandage',       'un', 1),
      ('Alcohol',               'pharmacy','Droplet',       'un', 1),
      ('Agua oxigenada',        'pharmacy','Droplet',       'un', 1),
      ('Termómetro',            'pharmacy','Thermometer',   'un', 1),
      ('Pomada para golpes',    'pharmacy','Pill',          'un', 1),
      ('Repelente',             'pharmacy','SprayCan',      'un', 1),
      ('Sales rehidratantes',   'pharmacy','Pill',          'un', 1),

      -- ===== Mascotas =====
      ('Alimento para perros',  'pets',    'PawPrint',      'kg', 2),
      ('Snacks para perros',    'pets',    'PawPrint',      'un', 1),
      ('Alimento para gatos',   'pets',    'PawPrint',      'kg', 2),
      ('Arena para gato',       'pets',    'PawPrint',      'kg', 1),
      ('Bolsitas sanitarias',   'pets',    'PawPrint',      'un', 1),
      ('Antiparasitario',       'pets',    'PawPrint',      'un', 1),

      -- ===== Bebé =====
      ('Pañales',               'baby',    'Baby',          'paq', 1),
      ('Toallitas húmedas',     'baby',    'Baby',          'paq', 1),
      ('Champú de bebé',        'baby',    'Baby',          'un', 1),
      ('Crema para colita',     'baby',    'Baby',          'un', 1),
      ('Leche maternizada',     'baby',    'Baby',          'un', 1),
      ('Papillas',              'baby',    'Baby',          'un', 1),

      -- ===== Para el hogar =====
      ('Pilas',                 'household','Battery',      'un', 4),
      ('Velas',                 'household','Flame',        'un', 2),
      ('Fósforos',              'household','Flame',        'un', 1),
      ('Encendedor',            'household','Flame',        'un', 1),
      ('Lamparitas LED',        'household','Lightbulb',    'un', 2),
      ('Pegamento',             'household','Wrench',       'un', 1),
      ('Bolsas con cierre',     'household','Package',      'un', 1)
  )
  insert into public.products
    (household_id, name, department, icon, unit, low_stock_threshold, is_active, quantity)
  select target_household_id, c.name, c.department, c.icon, c.unit, c.threshold, true, 0
  from catalog c
  where not exists (
    select 1 from public.products p
    where p.household_id = target_household_id
      and lower(p.name) = lower(c.name)
  );
end;
$$;


-- ----------------------------------------------------------------------------
-- 4) Re-sembrar catálogo en todos los hogares existentes
-- ----------------------------------------------------------------------------

do $$
declare
  h record;
begin
  for h in select id from public.households loop
    perform public.seed_catalog_for_household(h.id);
  end loop;
end $$;
