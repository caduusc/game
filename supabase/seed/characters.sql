-- Arquivo gerado por scripts/generate-seed.ts — não edite à mão.
insert into game_private.characters (id, name, birth, country, gender, origin, century, area, weapon, aliases, weapon_aliases) values
  ('machado', 'Machado de Assis', '1839-06-21', 'Brasil', 'M', 'BR', 'XIX', 'Arte', 'Café', array['machado']::text[], '{}'::text[]),
  ('santos-dumont', 'Santos Dumont', '1873-07-20', 'Brasil', 'M', 'BR', 'XIX', 'Ciência', 'Pólen', array['dumont', 'santos dumont']::text[], '{}'::text[]),
  ('getulio', 'Getúlio Vargas', '1882-04-19', 'Brasil', 'M', 'BR', 'XIX', 'Política', 'Canela', array['getulio', 'vargas']::text[], '{}'::text[]),
  ('jk', 'Juscelino Kubitschek', '1902-09-12', 'Brasil', 'M', 'BR', 'XX', 'Política', 'Amendoim', array['juscelino', 'kubitschek', 'jk']::text[], '{}'::text[]),
  ('niemeyer', 'Oscar Niemeyer', '1907-12-15', 'Brasil', 'M', 'BR', 'XX', 'Arte', 'Gergelim', array['niemeyer']::text[], '{}'::text[]),
  ('senna', 'Ayrton Senna', '1960-03-21', 'Brasil', 'M', 'BR', 'XX', 'Esporte', 'Camarão', array['senna']::text[], '{}'::text[]),
  ('isabel', 'Princesa Isabel', '1846-07-29', 'Brasil', 'F', 'BR', 'XIX', 'Política', 'Leite', array['isabel']::text[], '{}'::text[]),
  ('bertha', 'Bertha Lutz', '1894-08-02', 'Brasil', 'F', 'BR', 'XIX', 'Ciência', 'Mel', array['bertha', 'lutz']::text[], '{}'::text[]),
  ('tarsila', 'Tarsila do Amaral', '1886-09-01', 'Brasil', 'F', 'BR', 'XIX', 'Arte', 'Morango', array['tarsila']::text[], '{}'::text[]),
  ('zilda', 'Zilda Arns', '1934-08-25', 'Brasil', 'F', 'BR', 'XX', 'Ciência', 'Penicilina', array['zilda']::text[], '{}'::text[]),
  ('esther', 'Maria Esther Bueno', '1939-10-11', 'Brasil', 'F', 'BR', 'XX', 'Esporte', 'Látex', array['maria esther', 'esther bueno']::text[], '{}'::text[]),
  ('elis', 'Elis Regina', '1945-03-17', 'Brasil', 'F', 'BR', 'XX', 'Arte', 'Kiwi', array['elis']::text[], '{}'::text[]),
  ('van-gogh', 'Vincent van Gogh', '1853-03-30', 'Holanda', 'M', 'EX', 'XIX', 'Arte', 'Tomate', array['van gogh', 'gogh']::text[], '{}'::text[]),
  ('gandhi', 'Mahatma Gandhi', '1869-10-02', 'Índia', 'M', 'EX', 'XIX', 'Política', 'Soja', array['gandhi']::text[], '{}'::text[]),
  ('einstein', 'Albert Einstein', '1879-03-14', 'Alemanha', 'M', 'EX', 'XIX', 'Ciência', 'Ovo', array['einstein']::text[], '{}'::text[]),
  ('turing', 'Alan Turing', '1912-06-23', 'Inglaterra', 'M', 'EX', 'XX', 'Ciência', 'Mostarda', array['turing']::text[], '{}'::text[]),
  ('mandela', 'Nelson Mandela', '1918-07-18', 'África do Sul', 'M', 'EX', 'XX', 'Política', 'Nozes', array['mandela']::text[], '{}'::text[]),
  ('ali', 'Muhammad Ali', '1942-01-17', 'EUA', 'M', 'EX', 'XX', 'Esporte', 'Picada de abelha', array['muhammad ali', 'cassius clay']::text[], array['abelha', 'picada']::text[]),
  ('curie', 'Marie Curie', '1867-11-07', 'Polônia', 'F', 'EX', 'XIX', 'Ciência', 'Poeira', array['curie']::text[], '{}'::text[]),
  ('chanel', 'Coco Chanel', '1883-08-19', 'França', 'F', 'EX', 'XIX', 'Arte', 'Chocolate', array['chanel']::text[], '{}'::text[]),
  ('earhart', 'Amelia Earhart', '1897-07-24', 'EUA', 'F', 'EX', 'XIX', 'Esporte', 'Pelo de gato', array['earhart', 'amelia']::text[], '{}'::text[]),
  ('frida', 'Frida Kahlo', '1907-07-06', 'México', 'F', 'EX', 'XX', 'Arte', 'Abacaxi', array['frida', 'kahlo']::text[], '{}'::text[]),
  ('rosa-parks', 'Rosa Parks', '1913-02-04', 'EUA', 'F', 'EX', 'XX', 'Política', 'Peixe', array['rosa parks', 'parks']::text[], '{}'::text[]),
  ('nadia', 'Nadia Comăneci', '1961-11-12', 'Romênia', 'F', 'EX', 'XX', 'Esporte', 'Glúten', array['nadia', 'comaneci']::text[], '{}'::text[])
on conflict (id) do update set
  name = excluded.name, birth = excluded.birth, country = excluded.country, gender = excluded.gender,
  origin = excluded.origin, century = excluded.century, area = excluded.area, weapon = excluded.weapon,
  aliases = excluded.aliases, weapon_aliases = excluded.weapon_aliases;
delete from game_private.characters where id not in ('machado', 'santos-dumont', 'getulio', 'jk', 'niemeyer', 'senna', 'isabel', 'bertha', 'tarsila', 'zilda', 'esther', 'elis', 'van-gogh', 'gandhi', 'einstein', 'turing', 'mandela', 'ali', 'curie', 'chanel', 'earhart', 'frida', 'rosa-parks', 'nadia');
