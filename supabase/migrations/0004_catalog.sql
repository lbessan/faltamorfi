-- ============================================================================
-- Falta Morfi — Fase 3.7 (catálogo de tipos con departamentos e iconos)
--
-- Pegá todo este archivo en el SQL Editor de Supabase y ejecutá.
-- Idempotente: corre múltiples veces sin duplicar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Nuevas columnas en products
-- ----------------------------------------------------------------------------

alter table public.products
  add column if not exists department text,
  add column if not exists icon       text,
  add column if not exists is_active  boolean not null default true;

create index if not exists products_department_idx on public.products(department);
create index if not exists products_active_idx     on public.products(household_id, is_active);

-- ----------------------------------------------------------------------------
-- 2) Función que siembra el catálogo curado en un hogar.
--    No pisa productos que el usuario ya tenga (matcheo case-insensitive).
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
      ('Leche entera',          'dairy',   'Milk',          'un', 2),
      ('Leche descremada',      'dairy',   'Milk',          'un', 2),
      ('Leche sin lactosa',     'dairy',   'Milk',          'un', 1),
      ('Leche en polvo',        'dairy',   'Milk',          'un', 1),
      ('Yogur firme',           'dairy',   'Milk',          'un', 4),
      ('Yogur bebible',         'dairy',   'Milk',          'un', 2),
      ('Postre lácteo',         'dairy',   'IceCream',      'un', 4),
      ('Crema de leche',        'dairy',   'Milk',          'un', 1),
      ('Manteca',               'dairy',   'Butter',        'un', 1),
      ('Queso untable',         'dairy',   'Cookie',        'un', 1),
      ('Queso fresco',          'dairy',   'Cookie',        'un', 1),
      ('Queso semiduro',        'dairy',   'Cookie',        'un', 1),
      ('Queso rallado',         'dairy',   'Cookie',        'un', 1),
      ('Mozzarella',            'dairy',   'Cookie',        'un', 1),
      ('Dulce de leche',        'dairy',   'Cookie',        'un', 1),

      -- ===== Carnicería =====
      ('Carne picada',          'meat',    'Beef',          'kg', 1),
      ('Bife de chorizo',       'meat',    'Beef',          'kg', 1),
      ('Asado',                 'meat',    'Beef',          'kg', 1),
      ('Tira de asado',         'meat',    'Beef',          'kg', 1),
      ('Vacío',                 'meat',    'Beef',          'kg', 1),
      ('Lomo',                  'meat',    'Beef',          'kg', 1),
      ('Matambre',              'meat',    'Beef',          'kg', 1),
      ('Carne para guiso',      'meat',    'Beef',          'kg', 1),
      ('Pollo entero',          'meat',    'Drumstick',     'un', 1),
      ('Pechuga de pollo',      'meat',    'Drumstick',     'kg', 1),
      ('Pata muslo de pollo',   'meat',    'Drumstick',     'kg', 1),
      ('Carne de cerdo',        'meat',    'Beef',          'kg', 1),
      ('Bondiola',              'meat',    'Beef',          'kg', 1),
      ('Costillas de cerdo',    'meat',    'Beef',          'kg', 1),
      ('Cordero',               'meat',    'Beef',          'kg', 1),

      -- ===== Pescadería =====
      ('Merluza',               'fish',    'Fish',          'kg', 1),
      ('Salmón',                'fish',    'Fish',          'kg', 1),
      ('Atún fresco',           'fish',    'Fish',          'kg', 1),
      ('Calamares',             'fish',    'Fish',          'kg', 1),
      ('Camarones',             'fish',    'Fish',          'kg', 1),
      ('Langostinos',           'fish',    'Fish',          'kg', 1),
      ('Mejillones',            'fish',    'Fish',          'un', 1),

      -- ===== Fiambres =====
      ('Jamón cocido',          'deli',    'Ham',           'g',  200),
      ('Jamón crudo',           'deli',    'Ham',           'g',  100),
      ('Salame',                'deli',    'Ham',           'g',  100),
      ('Mortadela',             'deli',    'Ham',           'g',  200),
      ('Chorizo',               'deli',    'Beef',          'un', 4),
      ('Morcilla',              'deli',    'Beef',          'un', 2),
      ('Panceta',               'deli',    'Ham',           'g',  100),
      ('Salchichas',            'deli',    'Ham',           'un', 6),

      -- ===== Panadería =====
      ('Pan lactal',            'bakery',  'Sandwich',      'un', 1),
      ('Pan francés',           'bakery',  'Croissant',     'un', 4),
      ('Pan de hamburguesa',    'bakery',  'Sandwich',      'un', 4),
      ('Pan de pancho',         'bakery',  'Sandwich',      'un', 4),
      ('Pan árabe',             'bakery',  'Croissant',     'un', 2),
      ('Pan rallado',           'bakery',  'Croissant',     'paq', 1),
      ('Galletitas dulces',     'bakery',  'Cookie',        'paq', 2),
      ('Galletitas saladas',    'bakery',  'Cookie',        'paq', 2),
      ('Tostadas',              'bakery',  'Sandwich',      'paq', 1),
      ('Facturas',              'bakery',  'Croissant',     'un', 6),
      ('Medialunas',            'bakery',  'Croissant',     'un', 6),
      ('Donas',                 'bakery',  'Croissant',     'un', 4),

      -- ===== Almacén =====
      ('Fideos largos',         'pantry',  'Wheat',         'paq', 2),
      ('Fideos cortos',         'pantry',  'Wheat',         'paq', 2),
      ('Tirabuzones',           'pantry',  'Wheat',         'paq', 1),
      ('Mostachoes',            'pantry',  'Wheat',         'paq', 1),
      ('Ravioles',              'pantry',  'Wheat',         'paq', 1),
      ('Ñoquis',                'pantry',  'Wheat',         'paq', 1),
      ('Arroz blanco',          'pantry',  'Wheat',         'kg', 1),
      ('Arroz integral',        'pantry',  'Wheat',         'kg', 1),
      ('Arroz parboiled',       'pantry',  'Wheat',         'kg', 1),
      ('Lentejas',              'pantry',  'Bean',          'paq', 1),
      ('Garbanzos',             'pantry',  'Bean',          'paq', 1),
      ('Porotos negros',        'pantry',  'Bean',          'paq', 1),
      ('Porotos blancos',       'pantry',  'Bean',          'paq', 1),
      ('Polenta',               'pantry',  'Wheat',         'paq', 1),
      ('Avena',                 'pantry',  'Wheat',         'paq', 1),
      ('Harina 000',            'pantry',  'Wheat',         'kg', 1),
      ('Harina 0000',           'pantry',  'Wheat',         'kg', 1),
      ('Harina integral',       'pantry',  'Wheat',         'kg', 1),
      ('Maicena',               'pantry',  'Wheat',         'paq', 1),
      ('Sémola',                'pantry',  'Wheat',         'paq', 1),

      -- ===== Condimentos y salsas =====
      ('Aceite de girasol',     'condiments', 'Droplet',    'l',  1),
      ('Aceite de maíz',        'condiments', 'Droplet',    'l',  1),
      ('Aceite de oliva',       'condiments', 'Droplet',    'l',  1),
      ('Vinagre de alcohol',    'condiments', 'Droplet',    'l',  1),
      ('Vinagre de manzana',    'condiments', 'Droplet',    'l',  1),
      ('Vinagre balsámico',     'condiments', 'Droplet',    'un', 1),
      ('Salsa de tomate',       'condiments', 'Soup',       'un', 2),
      ('Puré de tomate',        'condiments', 'Soup',       'un', 2),
      ('Tomate en cubos',       'condiments', 'Soup',       'un', 2),
      ('Tomate triturado',      'condiments', 'Soup',       'un', 2),
      ('Ketchup',               'condiments', 'Soup',       'un', 1),
      ('Mayonesa',              'condiments', 'Soup',       'un', 1),
      ('Mostaza',               'condiments', 'Soup',       'un', 1),
      ('Salsa golf',            'condiments', 'Soup',       'un', 1),
      ('Salsa BBQ',             'condiments', 'Soup',       'un', 1),
      ('Salsa de soja',         'condiments', 'Soup',       'un', 1),
      ('Salsa picante',         'condiments', 'Soup',       'un', 1),
      ('Sal fina',              'condiments', 'Soup',       'paq', 1),
      ('Sal gruesa',            'condiments', 'Soup',       'paq', 1),
      ('Pimienta negra',        'condiments', 'Soup',       'un', 1),
      ('Pimentón dulce',        'condiments', 'Soup',       'un', 1),
      ('Pimentón ahumado',      'condiments', 'Soup',       'un', 1),
      ('Ají molido',            'condiments', 'Soup',       'un', 1),
      ('Orégano',               'condiments', 'Leaf',       'un', 1),
      ('Comino',                'condiments', 'Soup',       'un', 1),
      ('Laurel',                'condiments', 'Leaf',       'un', 1),
      ('Tomillo',               'condiments', 'Leaf',       'un', 1),
      ('Romero',                'condiments', 'Leaf',       'un', 1),
      ('Albahaca',              'condiments', 'Leaf',       'un', 1),
      ('Provenzal',             'condiments', 'Leaf',       'un', 1),
      ('Curry',                 'condiments', 'Soup',       'un', 1),
      ('Nuez moscada',          'condiments', 'Soup',       'un', 1),
      ('Canela',                'condiments', 'Soup',       'un', 1),
      ('Vainilla',              'condiments', 'Soup',       'un', 1),
      ('Caldo en cubos',        'condiments', 'Soup',       'un', 1),
      ('Caldo en polvo',        'condiments', 'Soup',       'un', 1),

      -- ===== Conservas =====
      ('Atún en lata',          'canned',  'Fish',          'un', 4),
      ('Sardinas en lata',      'canned',  'Fish',          'un', 2),
      ('Caballa en lata',       'canned',  'Fish',          'un', 2),
      ('Choclo en lata',        'canned',  'Wheat',         'un', 4),
      ('Arvejas en lata',       'canned',  'Bean',          'un', 2),
      ('Lentejas en lata',      'canned',  'Bean',          'un', 2),
      ('Garbanzos en lata',     'canned',  'Bean',          'un', 2),
      ('Palmitos',              'canned',  'Leaf',          'un', 2),
      ('Aceitunas verdes',      'canned',  'Cherry',        'un', 2),
      ('Aceitunas negras',      'canned',  'Cherry',        'un', 1),
      ('Pickles',               'canned',  'Carrot',        'un', 1),
      ('Duraznos en almíbar',   'canned',  'Apple',         'un', 1),
      ('Ananá en almíbar',      'canned',  'Apple',         'un', 1),
      ('Leche condensada',      'canned',  'Milk',          'un', 1),

      -- ===== Frutas y verduras =====
      ('Tomate',                'produce', 'Cherry',        'kg', 1),
      ('Tomate cherry',         'produce', 'Cherry',        'un', 1),
      ('Cebolla',               'produce', 'Carrot',        'kg', 1),
      ('Cebolla de verdeo',     'produce', 'Leaf',          'un', 2),
      ('Papa',                  'produce', 'Carrot',        'kg', 2),
      ('Batata',                'produce', 'Carrot',        'kg', 1),
      ('Zanahoria',             'produce', 'Carrot',        'kg', 1),
      ('Calabaza',              'produce', 'Carrot',        'un', 1),
      ('Zapallito',             'produce', 'Carrot',        'un', 4),
      ('Berenjena',             'produce', 'Carrot',        'un', 2),
      ('Morrón rojo',           'produce', 'Apple',         'un', 2),
      ('Morrón verde',          'produce', 'Apple',         'un', 2),
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
      ('Agua mineral sin gas',  'beverages', 'GlassWater',  'un', 4),
      ('Agua mineral con gas',  'beverages', 'GlassWater',  'un', 2),
      ('Agua saborizada',       'beverages', 'GlassWater',  'un', 2),
      ('Coca-Cola',             'beverages', 'CupSoda',     'un', 2),
      ('Sprite',                'beverages', 'CupSoda',     'un', 1),
      ('Fanta',                 'beverages', 'CupSoda',     'un', 1),
      ('Pepsi',                 'beverages', 'CupSoda',     'un', 1),
      ('Manaos',                'beverages', 'CupSoda',     'un', 1),
      ('Jugo en polvo',         'beverages', 'CupSoda',     'un', 4),
      ('Jugo en tetra',         'beverages', 'CupSoda',     'un', 2),
      ('Bebida isotónica',      'beverages', 'CupSoda',     'un', 2),
      ('Energizante',           'beverages', 'CupSoda',     'un', 2),

      -- ===== Bebidas alcohólicas =====
      ('Cerveza rubia',         'alcohol', 'Beer',          'un', 6),
      ('Cerveza negra',         'alcohol', 'Beer',          'un', 2),
      ('Cerveza IPA',           'alcohol', 'Beer',          'un', 4),
      ('Vino tinto',            'alcohol', 'Wine',          'un', 2),
      ('Vino blanco',           'alcohol', 'Wine',          'un', 2),
      ('Vino rosado',           'alcohol', 'Wine',          'un', 1),
      ('Espumante',             'alcohol', 'Wine',          'un', 1),
      ('Fernet',                'alcohol', 'Wine',          'un', 1),
      ('Whisky',                'alcohol', 'Wine',          'un', 1),
      ('Aperitivo',             'alcohol', 'Wine',          'un', 1),

      -- ===== Desayuno =====
      ('Café molido',           'breakfast', 'Coffee',      'un', 1),
      ('Café instantáneo',      'breakfast', 'Coffee',      'un', 1),
      ('Té en saquitos',        'breakfast', 'Coffee',      'un', 2),
      ('Té verde',              'breakfast', 'Coffee',      'un', 1),
      ('Mate cocido',           'breakfast', 'Coffee',      'un', 1),
      ('Yerba con palo',        'breakfast', 'Coffee',      'un', 1),
      ('Yerba sin palo',        'breakfast', 'Coffee',      'un', 1),
      ('Yerba saborizada',      'breakfast', 'Coffee',      'un', 1),
      ('Cacao en polvo',        'breakfast', 'Coffee',      'un', 1),
      ('Cereales',              'breakfast', 'Wheat',       'un', 2),
      ('Granola',               'breakfast', 'Wheat',       'un', 1),
      ('Avena instantánea',     'breakfast', 'Wheat',       'un', 1),
      ('Barras de cereal',      'breakfast', 'Cookie',      'paq', 2),
      ('Mermelada',             'breakfast', 'Cherry',      'un', 2),
      ('Miel',                  'breakfast', 'Cookie',      'un', 1),

      -- ===== Snacks =====
      ('Papas fritas',          'snacks',  'Cookie',        'paq', 2),
      ('Maní',                  'snacks',  'Bean',          'un', 2),
      ('Almendras',             'snacks',  'Bean',          'un', 1),
      ('Nueces',                'snacks',  'Bean',          'un', 1),
      ('Pasas de uva',          'snacks',  'Grape',         'un', 1),
      ('Frutos secos mixtos',   'snacks',  'Bean',          'un', 1),
      ('Chizitos',              'snacks',  'Cookie',        'paq', 2),
      ('Doritos',               'snacks',  'Cookie',        'paq', 2),
      ('Palitos salados',       'snacks',  'Cookie',        'paq', 2),
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
      ('Patatas fritas congeladas','frozen','Snowflake',    'paq', 2),
      ('Bastones de muzzarella','frozen',  'Snowflake',     'paq', 1),
      ('Verduras congeladas',   'frozen',  'Snowflake',     'paq', 2),
      ('Espinaca congelada',    'frozen',  'Snowflake',     'paq', 1),
      ('Frutos rojos congelados','frozen', 'Snowflake',     'paq', 1),
      ('Helado',                'frozen',  'IceCream',      'un', 1),
      ('Helado de palito',      'frozen',  'IceCream',      'un', 4),
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
      ('Esponja de acero',      'cleaning','Brush',         'un', 1),
      ('Trapo de piso',         'cleaning','Brush',         'un', 2),
      ('Trapo de cocina',       'cleaning','Brush',         'un', 2),
      ('Bolsas de residuos',    'cleaning','Trash2',        'un', 1),
      ('Bolsas de consorcio',   'cleaning','Trash2',        'un', 1),
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
      ('Desodorante en aerosol','personal_care','SprayCan',  'un', 1),
      ('Desodorante en barra',  'personal_care','SprayCan',  'un', 1),
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
      ('Pilas AA',              'household','Battery',      'un', 4),
      ('Pilas AAA',             'household','Battery',      'un', 4),
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
-- 3) Asignar department/icon a productos existentes (matcheo case-insensitive
--    contra el catálogo)
-- ----------------------------------------------------------------------------

-- Helper temporal: tabla CTE con el mismo catálogo
do $$
begin
  with catalog(name, department, icon) as (
    values
      -- Solo necesitamos name, department, icon para el backfill
      ('Leche entera',          'dairy',   'Milk'),
      ('Leche descremada',      'dairy',   'Milk'),
      ('Yogur firme',           'dairy',   'Milk'),
      ('Yogur bebible',         'dairy',   'Milk'),
      ('Manteca',               'dairy',   'Butter'),
      ('Queso',                 'dairy',   'Cookie'),
      ('Dulce de leche',        'dairy',   'Cookie'),
      ('Carne picada',          'meat',    'Beef'),
      ('Pollo',                 'meat',    'Drumstick'),
      ('Pan',                   'bakery',  'Sandwich'),
      ('Fideos',                'pantry',  'Wheat'),
      ('Arroz',                 'pantry',  'Wheat'),
      ('Aceite',                'condiments', 'Droplet'),
      ('Sal',                   'condiments', 'Soup'),
      ('Café',                  'breakfast', 'Coffee'),
      ('Yerba',                 'breakfast', 'Coffee'),
      ('Galletitas',            'bakery',  'Cookie'),
      ('Tomate',                'produce', 'Cherry'),
      ('Cebolla',               'produce', 'Carrot'),
      ('Papa',                  'produce', 'Carrot'),
      ('Lechuga',               'produce', 'Salad'),
      ('Banana',                'produce', 'Banana'),
      ('Manzana',               'produce', 'Apple'),
      ('Agua',                  'beverages', 'GlassWater'),
      ('Cerveza',               'alcohol', 'Beer'),
      ('Vino',                  'alcohol', 'Wine'),
      ('Detergente',            'cleaning','SprayCan'),
      ('Lavandina',             'cleaning','SprayCan'),
      ('Papel higiénico',       'personal_care','ShowerHead'),
      ('Champú',                'personal_care','ShowerHead'),
      ('Pasta dental',          'personal_care','ShowerHead'),
      ('Aspirina',              'pharmacy','Pill'),
      ('Ibuprofeno',            'pharmacy','Pill'),
      ('Curitas',               'pharmacy','Bandage'),
      ('Alimento para perros',  'pets',    'PawPrint'),
      ('Pañales',               'baby',    'Baby'),
      ('Pilas',                 'household','Battery')
  )
  update public.products p
  set department = c.department,
      icon = c.icon
  from catalog c
  where p.department is null
    and lower(p.name) like '%' || lower(c.name) || '%';
end $$;

-- Productos sin matchear quedan como 'other'
update public.products
set department = 'other',
    icon = coalesce(icon, 'Package')
where department is null;

-- ----------------------------------------------------------------------------
-- 4) Actualizar handle_new_user para sembrar el catálogo en hogares nuevos
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
  display_name     text;
begin
  display_name := coalesce(
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1),
    'mi hogar'
  );

  insert into public.households (name)
  values ('Casa de ' || display_name)
  returning id into new_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (new_household_id, new.id, 'owner');

  insert into public.locations (household_id, name, icon, kind, sort_order) values
    (new_household_id, 'Alacena',  'cabinet',      'pantry',   0),
    (new_household_id, 'Heladera', 'refrigerator', 'fridge',   1),
    (new_household_id, 'Freezer',  'snowflake',    'freezer',  2),
    (new_household_id, 'Botiquín', 'pill',         'medicine', 3);

  perform public.seed_catalog_for_household(new_household_id);

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5) Sembrar catálogo en hogares ya existentes (idempotente)
-- ----------------------------------------------------------------------------

do $$
declare h record;
begin
  for h in select id from public.households loop
    perform public.seed_catalog_for_household(h.id);
  end loop;
end $$;
