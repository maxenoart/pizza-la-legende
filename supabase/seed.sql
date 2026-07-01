-- ===========================================================================
-- seed.sql — Echtdaten La Légende (Stand: Analyse pizzalegende.ch, 2026-07-01)
-- Nach schema.sql ausführen. Idempotent (upsert per ON CONFLICT).
-- Preise pro Artikel sind NICHT öffentlich bekannt (nur „dès CHF 13.–") →
-- price bleibt NULL und wird vom Betreiber im Admin gepflegt. Nichts erfunden.
-- ===========================================================================

-- --- Einstellungen ---------------------------------------------------------
insert into settings (id, business_name, timezone, locale, menu_price_from)
values (true, 'La Légende', 'Europe/Zurich', 'fr-CH', 13)
on conflict (id) do update set
  business_name = excluded.business_name,
  menu_price_from = excluded.menu_price_from;

-- --- Leistung : Abholbestellung (capacity = Pizzen je 15-Min-Fenster) -------
insert into services (id, name, duration_minutes, capacity, sort) values
  ('commande', 'Commande à retirer', 15, 8, 1)
on conflict (id) do update set name = excluded.name, capacity = excluded.capacity;

-- --- Tournée-Standorte ------------------------------------------------------
insert into locations (id, name, place, service, phone, weekday_label_fr, weekday_label_de, sort) values
  ('tramelan',  'Tramelan',  'Fabien Bike Sàrl',            'soir', '079 369 10 36', 'Lundi',    'Montag',     1),
  ('bienne',    'Bienne',    'Swatch SA (devant le musée)', 'midi', '079 369 10 36', 'Mardi',    'Dienstag',   2),
  ('corgemont', 'Corgémont', 'Place communale',             'soir', '079 369 10 36', 'Mardi',    'Dienstag',   3),
  ('sonceboz',  'Sonceboz',  'Shop du Pierre-Pertuis',      'midi', '079 369 10 36', 'Mercredi', 'Mittwoch',   4),
  ('pery',      'Péry',      'Place communale',             'soir', '079 369 10 36', 'Mercredi', 'Mittwoch',   5),
  ('grandval',  'Grandval',  'Fromagerie Au P''tit lait',   'soir', '079 828 10 36', 'Mercredi', 'Mittwoch',   6),
  ('court',     'Court',     'Devant l''Ultra',             'soir', '079 369 10 36', 'Jeudi',    'Donnerstag', 7),
  ('preles',    'Prêles',    'Milieu du village',           'soir', '079 369 10 36', 'Vendredi', 'Freitag',    8)
on conflict (id) do update set
  name = excluded.name, place = excluded.place, service = excluded.service,
  phone = excluded.phone, weekday_label_fr = excluded.weekday_label_fr,
  weekday_label_de = excluded.weekday_label_de, sort = excluded.sort;

-- --- Öffnungszeiten je Standort (weekday: 0=So … 6=Sa) ----------------------
-- midi = 11:30–12:45, soir = 18:15–20:00
delete from availability_rules where scope = 'location';
insert into availability_rules (scope, location_id, weekday, start_time, end_time) values
  ('location', 'tramelan',  1, '18:15', '20:00'),
  ('location', 'bienne',    2, '11:30', '12:45'),
  ('location', 'corgemont', 2, '18:15', '20:00'),
  ('location', 'sonceboz',  3, '11:30', '12:45'),
  ('location', 'pery',      3, '18:15', '20:00'),
  ('location', 'grandval',  3, '18:15', '20:00'),
  ('location', 'court',     4, '18:15', '20:00'),
  ('location', 'preles',    5, '18:15', '20:00');

-- --- Karte : Kategorien -----------------------------------------------------
insert into product_categories (id, name_fr, name_de, sort) values
  ('signature',  'Les signatures',         'Signature-Pizzen',     1),
  ('classiques', 'Les classiques',         'Klassiker',            2),
  ('rotation',   'En rotation',            'Wechselnd',            3),
  ('vegan',      'Végétarien & vegan',     'Vegetarisch & vegan',  4),
  ('autres',     'Calzone & petites faims','Calzone & Kleines',    5),
  ('apero',      'L''apéro à l''italienne','Apéro auf Italienisch',6),
  ('desserts',   'Desserts maison',        'Hausgemachte Desserts',7),
  ('boissons',   'Boissons',               'Getränke',             8)
on conflict (id) do update set name_fr = excluded.name_fr, name_de = excluded.name_de, sort = excluded.sort;

-- --- Karte : Produits -------------------------------------------------------
insert into products (id, category_id, name_fr, name_de, desc_fr, desc_de, oven, tags, sort) values
  ('p_legende','signature','La Légende','La Légende',
    'Sauce tomate, mozzarella, origan, roquette, tomates cerises, Grana Padano et jambon cru.',
    'Tomatensauce, Mozzarella, Oregano, Rucola, Kirschtomaten, Grana Padano und Rohschinken.', true, '{signature}', 1),
  ('p_botanica','signature','La Botanica','La Botanica',
    'Notre signature végétale — fromage végan / sans lactose. Sublime avec un peu de roquette.',
    'Unsere pflanzliche Signature — veganer / laktosefreier Käse. Grossartig mit etwas Rucola.', true, '{vegan,veggie}', 2),
  ('p_margherita','classiques','Margherita','Margherita',
    'Sauce tomate, mozzarella, basilic frais.','Tomatensauce, Mozzarella, frisches Basilikum.', true, '{veggie}', 3),
  ('p_marinara','classiques','Marinara','Marinara',
    'Sauce tomate, ail, origan — la napolitaine originelle.','Tomatensauce, Knoblauch, Oregano — die neapolitanische Urform.', true, '{vegan,veggie}', 4),
  ('p_prosciutto','classiques','Prosciutto','Prosciutto',
    'Sauce tomate, mozzarella, jambon.','Tomatensauce, Mozzarella, Schinken.', true, '{}', 5),
  ('p_hawaii','classiques','Hawaii','Hawaii',
    'Sauce tomate, mozzarella, jambon, ananas.','Tomatensauce, Mozzarella, Schinken, Ananas.', true, '{}', 6),
  ('p_delmomento','rotation','Del Momento','Del Momento',
    'La création du moment du pizzaïolo. Demandez-la au camion !','Die aktuelle Kreation des Pizzaiolo. Fragt am Truck danach!', true, '{new}', 7),
  ('p_saison','rotation','De Saison','Saisonal',
    'Ingrédients de saison choisis avec soin — truffe, asperges ou raclette selon le moment.','Sorgfältig gewählte Saison-Zutaten — Trüffel, Spargel oder Raclette je nach Zeit.', true, '{new}', 8),
  ('p_veggie','vegan','Pizzas végétariennes','Vegetarische Pizzen',
    'Légumes grillés, champignons, épinards, artichauts — au choix.','Grillgemüse, Champignons, Spinat, Artischocken — nach Wahl.', true, '{veggie}', 9),
  ('p_vegan','vegan','Option vegan / sans lactose','Vegan / laktosefrei',
    'La plupart de nos pizzas se déclinent avec un fromage végan / sans lactose.','Die meisten Pizzen gibt es mit veganem / laktosefreiem Käse.', true, '{vegan}', 10),
  ('p_calzone','autres','Calzone','Calzone',
    'Pizza pliée cuite au feu de bois, garnie selon votre choix.','Gefaltete Pizza aus dem Holzofen, nach Wahl gefüllt.', true, '{}', 11),
  ('p_mini','autres','Mini pizzas','Mini-Pizzen',
    'Pour les enfants — ou pour goûter plusieurs saveurs.','Für Kinder — oder um mehrere Sorten zu probieren.', true, '{}', 12),
  ('p_sucree','autres','Pizzas sucrées','Süsse Pizzen',
    'Nutella ou caramel — la touche gourmande.','Nutella oder Karamell — der süsse Abschluss.', true, '{}', 13),
  ('p_planche','apero','Planche apéro italienne','Italienische Apéro-Platte',
    'Planche 100 % italienne à partager.','100 % italienische Platte zum Teilen.', false, '{}', 14),
  ('p_bruschetta','apero','Bruschettas maison','Hausgemachte Bruschette',
    'Préparées par nos soins.','Von uns frisch zubereitet.', true, '{}', 15),
  ('p_focaccia','apero','Focaccias maison','Hausgemachte Focaccia',
    'Moelleuse, cuite au feu de bois.','Fluffig, aus dem Holzofen.', true, '{}', 16),
  ('p_tira_classic','desserts','Tiramisu classique','Tiramisu klassisch','','', false, '{}', 17),
  ('p_tira_choco','desserts','Tiramisu chocolat','Tiramisu Schokolade','','', false, '{}', 18),
  ('p_tira_pist','desserts','Tiramisu pistache','Tiramisu Pistazie','','', false, '{}', 19),
  ('p_boissons','boissons','Boissons & softs','Getränke & Softdrinks',
    'Une sélection de boissons pour accompagner votre pizza.','Eine Auswahl an Getränken zur Pizza.', false, '{}', 20)
on conflict (id) do update set
  category_id = excluded.category_id, name_fr = excluded.name_fr, name_de = excluded.name_de,
  desc_fr = excluded.desc_fr, desc_de = excluded.desc_de, oven = excluded.oven,
  tags = excluded.tags, sort = excluded.sort;
