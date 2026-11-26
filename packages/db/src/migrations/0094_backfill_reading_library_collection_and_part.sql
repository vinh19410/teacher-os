DROP TABLE IF EXISTS `_tmp_blocked_prompt_0094`;
--> statement-breakpoint
DROP TABLE IF EXISTS `_tmp_reading_meta_0094`;
--> statement-breakpoint
CREATE TABLE `_tmp_reading_meta_0094` (`norm_title` text NOT NULL, `passage_clue` text NOT NULL DEFAULT '', `collection` text NOT NULL, `test_group` text NOT NULL, `part` text NOT NULL, `part_source` text NOT NULL);
--> statement-breakpoint
CREATE INDEX `_tmp_reading_meta_0094_title_idx` ON `_tmp_reading_meta_0094` (`norm_title`);
--> statement-breakpoint
INSERT INTO `_tmp_reading_meta_0094` (`norm_title`, `passage_clue`, `collection`, `test_group`, `part`, `part_source`) VALUES
	('''this marvellous invention''', 'language must take pride of', 'Cambridge IELTS 11', 'Test 4', 'p3', 'Cambridge IELTS 11 Test 4 — Passage 3'),
	('200 years of australian landscapes at the royal academy in london"', 'this exhibition promises to chart', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('a brief history of humans and food', 'during the journey from our', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('a brief history of rubber', 'rubber is one of the', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('a closer examination of a study on verbal andnon-verbal messages', 'verbal communication carried out in', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('a mechanical friend for children', 'the development of robots that', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('a new ice age', 'william curry is', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('a new role for livestock guard dogs', 'livestock guard dogs', 'Cambridge IELTS 20', 'Test 4', 'p3', 'Cambridge IELTS 20 Test 4 — Passage 3'),
	('a second attempt at domesticating the tomato', 'years for humans to learn', 'Cambridge IELTS 17', 'Test 2', 'p2', 'Cambridge IELTS 17 Test 2 — Passage 2'),
	('a silent force', 'legend that st augustine in', 'Other sources', 'Passage 2', 'p2', 'Other sources — Passage 2'),
	('a study of western celebrity', 'and even newspapers are often', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('a unique golden textile', 'man project to use spider', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('adapting to the effects of climate change', 'all around the world', 'Cambridge IELTS 20', 'Test 4', 'p2', 'Cambridge IELTS 20 Test 4 — Passage 2'),
	('advertising needs attention', 'the harder advertisers try to', 'Actual Test', 'Passage 1', 'p1', 'Actual Test — Passage 1'),
	('ahead of its time', 'one october afternoon', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('alexander henderson (1831-1913)', 'alexander henderson was born in', 'Cambridge IELTS 14', 'Test 2', 'p1', 'Cambridge IELTS 14 Test 2 — Passage 1'),
	('alfred wegener: science, exploration and the theory of continental drift', 'book about the life and', 'Cambridge IELTS 18', 'Test 4', 'p3', 'Cambridge IELTS 18 Test 4 — Passage 3'),
	('ambergris', 'mystical matter for perfumers', 'Forecast Quý 2-2025', 'Passage 1', 'p1', 'Forecast Quý 2-2025 — Passage 1'),
	('an ideal city', 'universally associated with the name', 'Cambridge IELTS 18', 'Test 2', 'p3', 'Cambridge IELTS 18 Test 2 — Passage 3'),
	('an important language development', 'first known system of handwriting', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('an inquiry into the existence of the gifted child', 'let us start by looking', 'Cambridge IELTS 19', 'Test 2', 'p3', 'Cambridge IELTS 19 Test 2 — Passage 3'),
	('an introduction to film sound', 'though we might think of', 'Cambridge IELTS 11', 'Test 4', 'p2', 'Cambridge IELTS 11 Test 4 — Passage 2'),
	('ancient people in sahara', 'professor from the university of', 'Actual Test', 'Passage 2', 'p2', 'Actual Test — Passage 2'),
	('ancient storytelling', 'the first stories were probably', 'Forecast Quý 2-2025', 'Passage 2', 'p2', 'Forecast Quý 2-2025 — Passage 2'),
	('antarctica - in from the cold?', 'men of the ilk of', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2');
--> statement-breakpoint
INSERT INTO `_tmp_reading_meta_0094` (`norm_title`, `passage_clue`, `collection`, `test_group`, `part`, `part_source`) VALUES
	('antartica and global warming', 'you are an aficionado of', 'Other sources', 'Passage 2', 'p2', 'Other sources — Passage 2'),
	('aqua product: new zealand''s algae biodiesel', 'aquaflow bionomic corporation has', 'Forecast Quý 2-2025', 'Passage 3', 'p3', 'Forecast Quý 2-2025 — Passage 3'),
	('archaeologists discover evidence of prehistoric island settlers', 'ceri shipton and his colleagues', 'Cambridge IELTS 19', 'Test 3', 'p1', 'Cambridge IELTS 19 Test 3 — Passage 1'),
	('artificial artists', 'the painting fool is one', 'Cambridge IELTS 13', 'Test 1', 'p3', 'Cambridge IELTS 13 Test 1 — Passage 3'),
	('assessing the threat of marine debris', 'member of the national center', 'Cambridge IELTS 14', 'Test 4', 'p3', 'Cambridge IELTS 14 Test 4 — Passage 3'),
	('athletes and stress', 'not only are the physical', 'Cambridge IELTS 19', 'Test 2', 'p2', 'Cambridge IELTS 19 Test 2 — Passage 2'),
	('attitudes towards artificial intelligence', 'can already predict the future', 'Cambridge IELTS 16', 'Test 4', 'p3', 'Cambridge IELTS 16 Test 4 — Passage 3'),
	('australia''s camouflaged creatures', 'most species use camouflage to', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('australia''s megafauna controversy', 'just how long did humans', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('autumn leaves', 'one of the most captivating', 'Cambridge IELTS 10', 'Test 3', 'p2', 'Cambridge IELTS 10 Test 3 — Passage 2'),
	('back to the future of skyscraper design', 'answers to the problem of', 'Cambridge IELTS 14', 'Test 2', 'p2', 'Cambridge IELTS 14 Test 2 — Passage 2'),
	('bats to the rescue', 'there are few places in', 'Cambridge IELTS 17', 'Test 4', 'p1', 'Cambridge IELTS 17 Test 4 — Passage 1'),
	('beyond the blue horizon', 'important archaeological discovery', 'Cambridge IELTS 10', 'Test 3', 'p3', 'Cambridge IELTS 10 Test 3 — Passage 3'),
	('biology of bitterness', 'have you ever wondered why', 'Forecast Quý 2-2025', 'Passage 3', 'p3', 'Forecast Quý 2-2025 — Passage 3'),
	('bondi beach', 'most famous beach', 'Actual Test', 'Passage 1', 'p1', 'Actual Test — Passage 1'),
	('book review', 'happiness is the ultimate goal', 'Cambridge IELTS 13', 'Test 4', 'p3', 'Cambridge IELTS 13 Test 4 — Passage 3'),
	('book review on musicophilia', 'review of oliver sacks', 'Forecast Quý 2-2025', 'Passage 2', 'p2', 'Forecast Quý 2-2025 — Passage 2'),
	('book review: the discovery of slowness by sten nadolny, translated by ralph freedman | canongate, 311 pp', 'the english explorer and writer', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('bovids', 'the family of mammals called', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('bring back the big cats', 'which describes hunting', 'Cambridge IELTS 12', 'Test 4', 'p2', 'Cambridge IELTS 12 Test 4 — Passage 2'),
	('bringing cinnamon to europe', 'fragrant spice produced from the', 'Cambridge IELTS 13', 'Test 2', 'p1', 'Cambridge IELTS 13 Test 2 — Passage 1'),
	('building an ancient castle in modern times', 'when michel guyot', 'Forecast Quý 2-2025', 'Passage 1', 'p1', 'Forecast Quý 2-2025 — Passage 1'),
	('building the skyline: the birth and growth of manhattan''s skyscrapers', 'book by jason barr about', 'Cambridge IELTS 17', 'Test 3', 'p3', 'Cambridge IELTS 17 Test 3 — Passage 3'),
	('caral: an ancient south american city', 'huge earth and rock mounds', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('carnivorous plants', 'the naturalist and author of', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1');
--> statement-breakpoint
INSERT INTO `_tmp_reading_meta_0094` (`norm_title`, `passage_clue`, `collection`, `test_group`, `part`, `part_source`) VALUES
	('case study: tourism new zealand website', 'small country of four million', 'Cambridge IELTS 13', 'Test 1', 'p1', 'Cambridge IELTS 13 Test 1 — Passage 1'),
	('changes in reading habits', 'look around on your next', 'Cambridge IELTS 16', 'Test 4', 'p2', 'Cambridge IELTS 16 Test 4 — Passage 2'),
	('charles darwin', 'the brilliant anthropologist and', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('child''s play in medieval england', 'and play the game', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('climate change and the inuit', 'unusual incidents are being reported', 'Other sources', 'Passage 3', 'p3', 'Other sources — Passage 3'),
	('climate change reveals ancient artefacts in norway''s glaciers', 'well above the treeline in', 'Cambridge IELTS 16', 'Test 3', 'p2', 'Cambridge IELTS 16 Test 3 — Passage 2'),
	('coastal archaeology of britain', 'the recognition of the wealth', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('collecting as a hobby', 'collecting must be one of', 'Cambridge IELTS 12', 'Test 1', 'p2', 'Cambridge IELTS 12 Test 1 — Passage 2'),
	('communication in science', 'science is the cornerstone of', 'Forecast Quý 2-2025', 'Passage 3', 'p3', 'Forecast Quý 2-2025 — Passage 3'),
	('computer games', 'not whether you win or', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('computer provides more questions than answers', 'the island of antikythera lies', 'Forecast Quý 2-2025', 'Passage 2', 'p2', 'Forecast Quý 2-2025 — Passage 2'),
	('conquering earth''s space junk problem', 'rocket shards and collision debris', 'Cambridge IELTS 18', 'Test 1', 'p3', 'Cambridge IELTS 18 Test 1 — Passage 3'),
	('coral reefs', 'calcium carbonate', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('coral reefs', 'london zoo', 'Cambridge IELTS 20', 'Test 3', 'p2', 'Cambridge IELTS 20 Test 3 — Passage 2'),
	('cork', 'the thick bark of the', 'Cambridge IELTS 12', 'Test 1', 'p1', 'Cambridge IELTS 12 Test 1 — Passage 1'),
	('corporate social responsibility', 'proponents of csr have used', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('could urban engineers learn from dance?', 'the way we travel around', 'Cambridge IELTS 15', 'Test 2', 'p1', 'Cambridge IELTS 15 Test 2 — Passage 1'),
	('creative problem-solving', 'solving is an ancient', 'Actual Test', 'Passage 2', 'p2', 'Actual Test — Passage 2'),
	('crop-growing skyscrapers', 'population will live in urban', 'Cambridge IELTS 11', 'Test 1', 'p1', 'Cambridge IELTS 11 Test 1 — Passage 1'),
	('crossing the threshold', 'architects are finding it very', 'Actual Test', 'Passage 3', 'p3', 'Actual Test — Passage 3'),
	('cutty sark: the fastest sailing ship of all time', 'the nineteenth century was', 'Cambridge IELTS 13', 'Test 4', 'p1', 'Cambridge IELTS 13 Test 4 — Passage 1'),
	('cyriacus', 'the italian merchant cyriacus of', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('dealing with different sleep patterns', 'sleep medicine is', 'Actual Test', 'Passage 1', 'p1', 'Actual Test — Passage 1'),
	('deep-sea mining', 'bacteria from the ocean floor', 'Cambridge IELTS 19', 'Test 4', 'p2', 'Cambridge IELTS 19 Test 4 — Passage 2'),
	('delivering the goods', 'international trade is growing at', 'Other sources', 'Passage 2', 'p2', 'Other sources — Passage 2');
--> statement-breakpoint
INSERT INTO `_tmp_reading_meta_0094` (`norm_title`, `passage_clue`, `collection`, `test_group`, `part`, `part_source`) VALUES
	('designed to last', 'senior lecturer at the university', 'Forecast Quý 2-2025', 'Passage 2', 'p2', 'Forecast Quý 2-2025 — Passage 2'),
	('diabetes', 'related facts that most people', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('dirty river but clean water', 'floods can occur in rivers', 'Forecast Quý 2-2025', 'Passage 1', 'p1', 'Forecast Quý 2-2025 — Passage 1'),
	('does class size matter?', 'all the ideas for improving', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('does education fuel economic growth?', 'over the last decade', 'Cambridge IELTS 17', 'Test 4', 'p2', 'Cambridge IELTS 17 Test 4 — Passage 2'),
	('dolls through the age', 'simple childrens toy has', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('driverless cars', 'the automotive sector is well', 'Cambridge IELTS 15', 'Test 1', 'p2', 'Cambridge IELTS 15 Test 1 — Passage 2'),
	('dust and the american west', 'images of deserts in the', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('e-training', 'learning is the unifying term', 'Forecast Quý 2-2025', 'Passage 2', 'p2', 'Forecast Quý 2-2025 — Passage 2'),
	('early approaches to organisational design', 'review of the classical and', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('early exploration of the west of canada', 'population was in the eastern', 'Forecast Quý 2-2025', 'Passage 2', 'p2', 'Forecast Quý 2-2025 — Passage 2'),
	('earth formation and the origin of species', 'why do some species die', 'Forecast Quý 2-2025', 'Passage 3', 'p3', 'Forecast Quý 2-2025 — Passage 3'),
	('easing traffic jams in large cities', 'traffic jams are becoming more', 'Other sources', 'Passage 1', 'p1', 'Other sources — Passage 1'),
	('environmental practices of big businesses', 'the environmental practices of big', 'Cambridge IELTS 15', 'Test 4', 'p3', 'Cambridge IELTS 15 Test 4 — Passage 3'),
	('environmentally-friendly! vehicles', 'the california air resources board', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('european heat wave', 'scientists now realise', 'Forecast Quý 2-2025', 'Passage 3', 'p3', 'Forecast Quý 2-2025 — Passage 3'),
	('european transport systems 1990 - 2010', 'difficult to conceive of vigorous', 'Cambridge IELTS 10', 'Test 1', 'p2', 'Cambridge IELTS 10 Test 1 — Passage 2'),
	('facial expressions', 'facial expression is best defined', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('father of modern management', 'been said that peter drucker', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('find your way out of a food desert', 'over the last few months', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('fishbourne roman palace', 'fishbourne roman palace is in', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('flower power', 'why do we give people', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('flying tortoises', 'airborne reintroduction programme', 'Cambridge IELTS 12', 'Test 3', 'p1', 'Cambridge IELTS 12 Test 3 — Passage 1'),
	('food of thought', 'there are not enough classrooms', 'Actual Test', 'Passage 1', 'p1', 'Actual Test — Passage 1'),
	('footprints in the muds of time', 'everybody knows that the dinosaurs', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1');
--> statement-breakpoint
INSERT INTO `_tmp_reading_meta_0094` (`norm_title`, `passage_clue`, `collection`, `test_group`, `part`, `part_source`) VALUES
	('forest management in pennsylvania, usa', 'depends on several factors including', 'Cambridge IELTS 18', 'Test 1', 'p2', 'Cambridge IELTS 18 Test 1 — Passage 2'),
	('from princes to paupers: how goya''s portraits tell the story of spain', 'according to current scholarship', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('frozen food', 'perspective on the development of', 'Cambridge IELTS 20', 'Test 3', 'p1', 'Cambridge IELTS 20 Test 3 — Passage 1'),
	('game theory', 'computer software that models human', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('georgia o''keeffe', 'for seven decades', 'Cambridge IELTS 20', 'Test 4', 'p1', 'Cambridge IELTS 20 Test 4 — Passage 1'),
	('gifted children and learning', 'most frequently determined by', 'Cambridge IELTS 10', 'Test 2', 'p2', 'Cambridge IELTS 10 Test 2 — Passage 2'),
	('great migrations', 'however it is defined', 'Cambridge IELTS 11', 'Test 3', 'p2', 'Cambridge IELTS 11 Test 3 — Passage 2'),
	('green roofs', 'rooftops covered with grass', 'Cambridge IELTS 18', 'Test 4', 'p1', 'Cambridge IELTS 18 Test 4 — Passage 1'),
	('grey workers', 'given the speed at which', 'Forecast Quý 2-2025', 'Passage 1', 'p1', 'Forecast Quý 2-2025 — Passage 1'),
	('griffith and american films', 'movies are key cultural artifacts', 'Actual Test', 'Passage 1', 'p1', 'Actual Test — Passage 1'),
	('growing more for less', 'working out the optimal amount', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('having a laugh', 'humans start developing', 'Cambridge IELTS 15', 'Test 2', 'p3', 'Cambridge IELTS 15 Test 2 — Passage 3'),
	('henry moore (1898-1986)', 'henry moore was born in', 'Cambridge IELTS 15', 'Test 3', 'p1', 'Cambridge IELTS 15 Test 3 — Passage 1'),
	('homeopathy', 'branch of holistic medicine which', 'Forecast Quý 2-2025', 'Passage 1', 'p1', 'Forecast Quý 2-2025 — Passage 1'),
	('how baby talk gives infant brains a boost', 'the typical way of talking', 'Cambridge IELTS 13', 'Test 3', 'p2', 'Cambridge IELTS 13 Test 3 — Passage 2'),
	('how stress affects our judgement', 'some of the most important', 'Cambridge IELTS 20', 'Test 1', 'p3', 'Cambridge IELTS 20 Test 1 — Passage 3'),
	('how tennis rackets have changed', 'the british professional tennis', 'Cambridge IELTS 19', 'Test 1', 'p1', 'Cambridge IELTS 19 Test 1 — Passage 1'),
	('how to make wise decisions?', 'wisdom has been considered one', 'Cambridge IELTS 16', 'Test 2', 'p3', 'Cambridge IELTS 16 Test 2 — Passage 3'),
	('i contain multitudes', 'most of them bacteria', 'Cambridge IELTS 16', 'Test 2', 'p2', 'Cambridge IELTS 16 Test 2 — Passage 2'),
	('images and places', 'new research method uses photography', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('improving patient safety', 'one of the most prominent', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('insight or evolution?', 'scientific discovery is popularly', 'Cambridge IELTS 17', 'Test 2', 'p3', 'Cambridge IELTS 17 Test 2 — Passage 3'),
	('intelligent behaviour in birds', 'many people are aware of', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('invasion of the robot umpires', 'fred dejesus from brooklyn', 'Cambridge IELTS 20', 'Test 2', 'p3', 'Cambridge IELTS 20 Test 2 — Passage 3'),
	('investing in the future', 'the founding and development of', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1');
--> statement-breakpoint
INSERT INTO `_tmp_reading_meta_0094` (`norm_title`, `passage_clue`, `collection`, `test_group`, `part`, `part_source`) VALUES
	('investment in shares versus investment in other assets - which gives the greater gain?', 'phone call from louis engel', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('is graffiti art or crime?', 'the term graffiti derives from', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('is it any wonder that there are teacher shortages?', 'any wonder that there are', 'Other sources', 'Passage 2', 'p2', 'Other sources — Passage 2'),
	('is the era of artificial speech translation upon us?', 'once the stuff of science', 'Cambridge IELTS 19', 'Test 3', 'p3', 'Cambridge IELTS 19 Test 3 — Passage 3'),
	('jean piaget (1896-1980)', 'jean piaget spent much of', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('jellyfish - the dominant species', 'jellyfish have become the curse', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('katherine mansfield', 'katherine mansfield beauchamp murry', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('keep a watchful eye on the bridges', 'most road and rail bridges', 'Forecast Quý 2-2025', 'Passage 2', 'p2', 'Forecast Quý 2-2025 — Passage 2'),
	('keep the water away', 'floods on the rivers of', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('knowledge in medicine', 'what counts as knowledge', 'Actual Test', 'Passage 1', 'p1', 'Actual Test — Passage 1'),
	('language strategies in multinational companies', 'increasingly globalized world', 'Forecast Quý 2-2025', 'Passage 3', 'p3', 'Forecast Quý 2-2025 — Passage 3'),
	('language strategy in multinational company', 'the importance of language', 'Actual Test', 'Passage 3', 'p3', 'Actual Test — Passage 3'),
	('leaf-cutting ants and fungus', 'the ants and their agriculture', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('learning from the romans', 'quest to make concrete more', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('learning theory', 'learning theory is rooted in', 'Forecast Quý 2-2025', 'Passage 1', 'p1', 'Forecast Quý 2-2025 — Passage 1'),
	('lever brothers'' sunlight soap: a revolution in hygiene and industry', 'produced by the lever brothers', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('listening to the ocean', 'the oceans cover more than', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('living dunes', 'when you think of', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('living in a world of sound', 'not difficult for', 'Forecast Quý 2-2025', 'Passage 1', 'p1', 'Forecast Quý 2-2025 — Passage 1'),
	('living with artificial intelligence', 'this has been the decade', 'Cambridge IELTS 18', 'Test 2', 'p2', 'Cambridge IELTS 18 Test 2 — Passage 2'),
	('london swaying footbridge', 'competition was organized by the', 'Forecast Quý 2-2025', 'Passage 3', 'p3', 'Forecast Quý 2-2025 — Passage 3'),
	('looking at daily life in ancient rome', '', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('making every drop count', 'the history of human civilisation', 'Cambridge IELTS 7', 'Test 1', 'p2', 'Cambridge IELTS 7 Test 1 — Passage 2'),
	('making the most of trends', 'most managers can identify the', 'Cambridge IELTS 13', 'Test 2', 'p3', 'Cambridge IELTS 13 Test 2 — Passage 3'),
	('manatees', 'also known as sea cows', 'Cambridge IELTS 20', 'Test 2', 'p1', 'Cambridge IELTS 20 Test 2 — Passage 1');
--> statement-breakpoint
INSERT INTO `_tmp_reading_meta_0094` (`norm_title`, `passage_clue`, `collection`, `test_group`, `part`, `part_source`) VALUES
	('maori fish hooks', 'maori fish hooks', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('mark strizic: a career of an australian photographer', 'who passed away in december', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('marketing and the information age', 'for the early practitioners of', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('materials to take us beyond concrete', 'concrete is the second most', 'Cambridge IELTS 18', 'Test 3', 'p1', 'Cambridge IELTS 18 Test 3 — Passage 1'),
	('mechanisms of linguistic change', 'the changes that have caused', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('memory and age', 'aging is an inevitable component', 'Forecast Quý 2-2025', 'Passage 3', 'p3', 'Forecast Quý 2-2025 — Passage 3'),
	('memory decoding', 'try this memory test', 'Actual Test', 'Passage 3', 'p3', 'Actual Test — Passage 3'),
	('mercator the map maker', 'maps codify the miracle of', 'Actual Test', 'Passage 3', 'p3', 'Actual Test — Passage 3'),
	('mind music', 'song stuck in your head', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('motivational factors and the hospitality industry', 'critical ingredient in the success', 'Cambridge IELTS 14', 'Test 1', 'p3', 'Cambridge IELTS 14 Test 1 — Passage 3'),
	('multitasking debate', 'talking on the phone while', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('museum blockbuster', 'trendy term that has been', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('museums of fine art and their public', 'the fact that people go', 'Cambridge IELTS 10', 'Test 2', 'p3', 'Cambridge IELTS 10 Test 2 — Passage 3'),
	('music and the emotions', 'why does music make us', 'Cambridge IELTS 12', 'Test 3', 'p3', 'Cambridge IELTS 12 Test 3 — Passage 3'),
	('music: language we all speak', 'music is one of the', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('mystery of elephant communication', 'postdoctoral fellow from stanford', 'Forecast Quý 2-2025', 'Passage 1', 'p1', 'Forecast Quý 2-2025 — Passage 1'),
	('nanotechnology: its development and uses', 'nanotechnology has been hailed by', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('neanderthal technology', 'think of our prehistoric ancestors', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('networking', 'concept has acquired what is', 'Other sources', 'Passage 1', 'p1', 'Other sources — Passage 1'),
	('neuroaesthetics', 'emerging discipline called', 'Cambridge IELTS 11', 'Test 2', 'p3', 'Cambridge IELTS 11 Test 2 — Passage 3'),
	('new filter promises clean water for millions', 'ingenious invention is set to', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('nineteenth-century paperback literature', 'publishing craze that hit both', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('novice and expert', 'expertise is commitment coupled with', 'Actual Test', 'Passage 1', 'p1', 'Actual Test — Passage 1'),
	('nutmeg - a valuable spice', 'large evergreen tree native to', 'Cambridge IELTS 15', 'Test 1', 'p1', 'Cambridge IELTS 15 Test 1 — Passage 1'),
	('nutrition and education', 'the msekeni primary school in', 'Forecast Quý 2-2025', 'Passage 3', 'p3', 'Forecast Quý 2-2025 — Passage 3');
--> statement-breakpoint
INSERT INTO `_tmp_reading_meta_0094` (`norm_title`, `passage_clue`, `collection`, `test_group`, `part`, `part_source`) VALUES
	('olive oil production', 'olive oil has been one', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('oxytocin', 'hormone produced in the pituitary', 'Cambridge IELTS 13', 'Test 2', 'p2', 'Cambridge IELTS 13 Test 2 — Passage 2'),
	('palm oil', 'palm oil is an edible', 'Cambridge IELTS 17', 'Test 3', 'p2', 'Cambridge IELTS 17 Test 3 — Passage 2'),
	('petrol power: an eco-revolution?', 'laura ingalls wilders semi', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('plant ''thermometer'' triggers springtime growth by measuring night-time heat', 'photoreceptor molecule in plant', 'Cambridge IELTS 16', 'Test 3', 'p3', 'Cambridge IELTS 16 Test 3 — Passage 3'),
	('playing soccer', 'its name implies', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('playing with science', 'the connection between science and', 'Actual Test', 'Passage 2', 'p2', 'Actual Test — Passage 2'),
	('preface to ''how the other half thinks: adventures in mathematical reasoning''', 'some difficult musical compositions', 'Cambridge IELTS 11', 'Test 3', 'p3', 'Cambridge IELTS 11 Test 3 — Passage 3'),
	('procrastination', 'psychologist explains why we put', 'Cambridge IELTS 20', 'Test 2', 'p2', 'Cambridge IELTS 20 Test 2 — Passage 2'),
	('prosopagnosia (sorry... who are you?)', 'medical condition that stops people', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('quantitative research versus qualitative research in education', 'swiss developmental psychologist and', 'Forecast Quý 2-2025', 'Passage 2', 'p2', 'Forecast Quý 2-2025 — Passage 2'),
	('raising the mary rose', 'century warship was recovered from', 'Cambridge IELTS 11', 'Test 2', 'p1', 'Cambridge IELTS 11 Test 2 — Passage 1'),
	('reducing the effects of climate change', 'such is our dependence on', 'Cambridge IELTS 11', 'Test 1', 'p3', 'Cambridge IELTS 11 Test 1 — Passage 3'),
	('reintroducing elms to britain', 'all elm trees in the', 'Cambridge IELTS 20', 'Test 1', 'p2', 'Cambridge IELTS 20 Test 1 — Passage 2'),
	('research using twins', 'biomedical researchers all over the', 'Cambridge IELTS 11', 'Test 4', 'p1', 'Cambridge IELTS 11 Test 4 — Passage 1'),
	('return of monkey life', 'rain forest trees growing anew', 'Actual Test', 'Passage 2', 'p2', 'Actual Test — Passage 2'),
	('robert louis stevenson', 'and travel writer', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('robots and us', 'should robots be used to', 'Cambridge IELTS 20', 'Test 3', 'p3', 'Cambridge IELTS 20 Test 3 — Passage 3'),
	('roman shipbuilding and navigation', 'shipbuilding today is based on', 'Cambridge IELTS 16', 'Test 3', 'p1', 'Cambridge IELTS 16 Test 3 — Passage 1'),
	('roman tunnels', 'who lived in present', 'Cambridge IELTS 16', 'Test 4', 'p1', 'Cambridge IELTS 16 Test 4 — Passage 1'),
	('satellite technology', 'age began with the launch', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('saving bugs to find new drugs', 'more drugs than you might', 'Cambridge IELTS 14', 'Test 3', 'p2', 'Cambridge IELTS 14 Test 3 — Passage 2'),
	('saving the soil', 'third of the earth', 'Cambridge IELTS 13', 'Test 4', 'p2', 'Cambridge IELTS 13 Test 4 — Passage 2'),
	('science and filmmaking', 'every year the film academy', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('sea change for salinity', 'one of the most serious', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1');
--> statement-breakpoint
INSERT INTO `_tmp_reading_meta_0094` (`norm_title`, `passage_clue`, `collection`, `test_group`, `part`, `part_source`) VALUES
	('second nature', 'your personality isn', 'Cambridge IELTS 10', 'Test 4', 'p2', 'Cambridge IELTS 10 Test 4 — Passage 2'),
	('seed vault guards resources for the future', 'from the north pole', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('should we stop eating meat?', 'call for people to eat', 'Actual Test', 'Passage 2', 'p2', 'Actual Test — Passage 2'),
	('should we try to bring extinct species back to life?', 'the passenger pigeon was', 'Cambridge IELTS 15', 'Test 2', 'p2', 'Cambridge IELTS 15 Test 2 — Passage 2'),
	('sign, baby, sign!', 'powerful tool that humans use', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('silbo gomero - the whistle ''language'' of the canary islands', 'gomera is one of the', 'Cambridge IELTS 15', 'Test 4', 'p2', 'Cambridge IELTS 15 Test 4 — Passage 2'),
	('sleep', 'like many things about your', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('sleep paralysis', 'people experience dreams', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('smell and memory', 'the proustian phenomenon in which', 'Forecast Quý 2-2025', 'Passage 1', 'p1', 'Forecast Quý 2-2025 — Passage 1'),
	('sociopolitical themes of british architecture', 'architecture contains elements of', 'Forecast Quý 2-2025', 'Passage 3', 'p3', 'Forecast Quý 2-2025 — Passage 3'),
	('solving traffic problems in big cities', 'many big cities around the', 'Other sources', 'Passage 1', 'p1', 'Other sources — Passage 1'),
	('some views on the use of headphones', 'whether wearing headphones at work', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('soviet''s new working week', 'historian investigates how stalin', 'Forecast Quý 2-2025', 'Passage 3', 'p3', 'Forecast Quý 2-2025 — Passage 3'),
	('stadiums: past, present and future', 'stadiums are among the oldest', 'Cambridge IELTS 17', 'Test 1', 'p2', 'Cambridge IELTS 17 Test 1 — Passage 2'),
	('star performers', 'one widely held assumption about', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('stealth forces in weight loss', 'the field of weight loss', 'Forecast Quý 2-2025', 'Passage 3', 'p3', 'Forecast Quý 2-2025 — Passage 3'),
	('stepwells', 'stepwells were fundamental to life', 'Cambridge IELTS 10', 'Test 1', 'p1', 'Cambridge IELTS 10 Test 1 — Passage 1'),
	('stonehenge', 'historians and archaeologists have', 'Cambridge IELTS 18', 'Test 2', 'p1', 'Cambridge IELTS 18 Test 2 — Passage 1'),
	('strange world of sight', 'seeing is believing', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('stress less', 'how busy is too busy', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('studies in the history of art and visual culture', 'general informationthe department of', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('surviving city life', 'although the colonisation of', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('sydney opera house', 'sydney opera house is an', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('talc powder', 'peter brigg discovers how talc', 'Actual Test', 'Passage 3', 'p3', 'Actual Test — Passage 3'),
	('tasmania''s museum of old and new art (new)', 'old living in the small', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3');
--> statement-breakpoint
INSERT INTO `_tmp_reading_meta_0094` (`norm_title`, `passage_clue`, `collection`, `test_group`, `part`, `part_source`) VALUES
	('tasmanian tiger', 'although it was called tiger', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('tea and industrial revolution', 'alan macfarlane thinks he could', 'Actual Test', 'Passage 1', 'p1', 'Actual Test — Passage 1'),
	('tea and the industrial revolution', 'professor of anthropological science', 'Cambridge IELTS 10', 'Test 2', 'p1', 'Cambridge IELTS 10 Test 2 — Passage 1'),
	('team building', 'poverty point in the us', 'Trainer', 'Passage 1', 'p1', 'Trainer — Passage 1'),
	('termite mounds', 'termites are destructive insects', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('the adolescents', 'the american academy of pediatrics', 'Actual Test', 'Passage 1', 'p1', 'Actual Test — Passage 1'),
	('the analysis of fear', 'researchers are investigating the', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('the ant and the mandarin', 'the farmers of berne in', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('the art of deception', 'the research psychologist dr paul', 'Actual Test', 'Passage 3', 'p3', 'Actual Test — Passage 3'),
	('the art of persuasion', 'whether we are aware of', 'Forecast Quý 2-2025', 'Passage 2', 'p2', 'Forecast Quý 2-2025 — Passage 2'),
	('the benefits of being bilingual', 'according to the latest figures', 'Cambridge IELTS 12', 'Test 2', 'p3', 'Cambridge IELTS 12 Test 2 — Passage 3'),
	('the burgess shale fossils', 'some discoveries are so unusual', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('the case for mixed-ability classes', 'picture this scene', 'Cambridge IELTS 18', 'Test 3', 'p3', 'Cambridge IELTS 18 Test 3 — Passage 3'),
	('the changing face of farming in the canterburyregion of new zealand', 'the landscape of the rural', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('the clipper races: an era of competition between cargo ships', 'during the seventeenth and', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('the coconut palm', 'the coconut has been central', 'Cambridge IELTS 13', 'Test 3', 'p1', 'Cambridge IELTS 13 Test 3 — Passage 1'),
	('the concept of childhood in the western countries', 'the history of childhood has', 'Forecast Quý 2-2025', 'Passage 1', 'p1', 'Forecast Quý 2-2025 — Passage 1'),
	('the concept of intelligence', 'looked at in one way', 'Cambridge IELTS 14', 'Test 3', 'p1', 'Cambridge IELTS 14 Test 3 — Passage 1'),
	('the constant evolution of the humble tomato', 'varieties that have been passed', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('the context, meaning and scope of tourism', 'travel has existed since the', 'Cambridge IELTS 10', 'Test 3', 'p1', 'Cambridge IELTS 10 Test 3 — Passage 1'),
	('the contradictions of tourism', 'tourism may bring benefits to', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('the dead sea scrolls', 'three bedouin teenagers were tending', 'Cambridge IELTS 17', 'Test 2', 'p1', 'Cambridge IELTS 17 Test 2 — Passage 1'),
	('the desolenator: producing clean water', 'travelling around thailand in the', 'Cambridge IELTS 15', 'Test 3', 'p2', 'Cambridge IELTS 15 Test 3 — Passage 2'),
	('the development of the london underground railway', 'the first half of the', 'Cambridge IELTS 17', 'Test 1', 'p1', 'Cambridge IELTS 17 Test 1 — Passage 1'),
	('the development of the silk industry', 'natural fibre produced by', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1');
--> statement-breakpoint
INSERT INTO `_tmp_reading_meta_0094` (`norm_title`, `passage_clue`, `collection`, `test_group`, `part`, `part_source`) VALUES
	('the dingo debate', 'graziers see them as pests', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('the dinosaurs footprints and extinction', 'everybody knows that the dinosaurs', 'Other sources', 'Passage 1', 'p1', 'Other sources — Passage 1'),
	('the dugong: sea cow', 'dugongs are herbivorous mammals that', 'Actual Test', 'Passage 1', 'p1', 'Actual Test — Passage 1'),
	('the early history of olive oil', 'olive oil is produced from', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('the evolution of film making', 'both an artistic pursuit and', 'Actual Test', 'Passage 2', 'p2', 'Actual Test — Passage 2'),
	('the exploration of mars', 'italian astronomer giovanni', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('the extinction of cave bear', 'evolutionary biologist at the', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('the falkirk wheel', 'the falkirk wheel in scotland', 'Cambridge IELTS 11', 'Test 1', 'p2', 'Cambridge IELTS 11 Test 1 — Passage 2'),
	('the farmers:the past and the present', 'the farmers trading company began', 'Forecast Quý 2-2025', 'Passage 2', 'p2', 'Forecast Quý 2-2025 — Passage 2'),
	('the fashion industry', 'the fashion industry is', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('the fluoridation controversy', 'standing debate about whether to', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('the fruit book', 'not every scientist who writes', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('the future of work', 'leading business consultancy', 'Cambridge IELTS 16', 'Test 1', 'p3', 'Cambridge IELTS 16 Test 1 — Passage 3'),
	('the global importance of wetlands', 'wetlands are areas where water', 'Cambridge IELTS 19', 'Test 3', 'p2', 'Cambridge IELTS 19 Test 3 — Passage 2'),
	('the growth mindset', 'over the past century', 'Cambridge IELTS 18', 'Test 4', 'p2', 'Cambridge IELTS 18 Test 4 — Passage 2'),
	('the growth of bike-sharing schemes around the world', 'the original idea for an', 'Cambridge IELTS 14', 'Test 1', 'p2', 'Cambridge IELTS 14 Test 1 — Passage 2'),
	('the history of glass', 'from our earliest origins', 'Cambridge IELTS 12', 'Test 4', 'p1', 'Cambridge IELTS 12 Test 4 — Passage 1'),
	('the history of pencil', 'the beginning of the story', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('the history of salt', 'salt is so simple and', 'Actual Test', 'Passage 2', 'p2', 'Actual Test — Passage 2'),
	('the history of tea', 'the story of tea begins', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('the history of the bar code', 'the first step toward today', 'Actual Test', 'Passage 1', 'p1', 'Actual Test — Passage 1'),
	('the history of the chicken', 'the story begins', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('the history of the guitar', 'was brought into english as', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('the impact of climate change on butterflies in britain', 'according to conservationists', 'Cambridge IELTS 19', 'Test 4', 'p1', 'Cambridge IELTS 19 Test 4 — Passage 1'),
	('the impact of the potato', 'the potato was first cultivated', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1');
--> statement-breakpoint
INSERT INTO `_tmp_reading_meta_0094` (`norm_title`, `passage_clue`, `collection`, `test_group`, `part`, `part_source`) VALUES
	('the importance of business cards', 'the exchanging of business cards', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('the importance of children''s play', 'old alice is building', 'Cambridge IELTS 14', 'Test 1', 'p1', 'Cambridge IELTS 14 Test 1 — Passage 1'),
	('the importance of law', 'the law influences all of', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('the industrial revolution in britain', 'the industrial revolution began in', 'Cambridge IELTS 19', 'Test 2', 'p1', 'Cambridge IELTS 19 Test 2 — Passage 1'),
	('the intersection of health sciences and geography', 'while many diseases that affect', 'Cambridge IELTS 12', 'Test 3', 'p2', 'Cambridge IELTS 12 Test 3 — Passage 2'),
	('the kākāpō', 'also known as the owl', 'Cambridge IELTS 20', 'Test 1', 'p1', 'Cambridge IELTS 20 Test 1 — Passage 1'),
	('the last man who knew everything', 'would be quite impossible for', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('the legend of tea', 'the story of tea began', 'Actual Test', 'Passage 3', 'p3', 'Actual Test — Passage 3'),
	('the life of beatrix potter', 'beatrix potter is one of', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('the long view', 'the business of predicting the', 'Actual Test', 'Passage 3', 'p3', 'Actual Test — Passage 3'),
	('the lost city', 'when the us explorer and', 'Cambridge IELTS 12', 'Test 2', 'p2', 'Cambridge IELTS 12 Test 2 — Passage 2'),
	('the megafires of california', 'wildfires are becoming an increasing', 'Cambridge IELTS 10', 'Test 4', 'p1', 'Cambridge IELTS 10 Test 4 — Passage 1'),
	('the new zealand writer margaret mahy', 'career spanning some fifty years', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('the origin and development of applause', 'scholars are not completely sure', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('the origin of paper', 'the word paper derives from', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('the pearl', 'the pearl has always had', 'Actual Test', 'Passage 1', 'p1', 'Actual Test — Passage 1'),
	('the peopling of patagonia', 'the human settlement of the', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('the perfume hunters', 'ever since the unguentari plied', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('the persistence and peril of misinformation', 'brian southwell looks at how', 'Cambridge IELTS 19', 'Test 1', 'p3', 'Cambridge IELTS 19 Test 1 — Passage 3'),
	('the pirahã people of brazil', 'tribe live deep in brazil', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('the pirates of the ancient mediterranean', 'when one mentions pirates', 'Cambridge IELTS 19', 'Test 1', 'p2', 'Cambridge IELTS 19 Test 1 — Passage 2'),
	('the placebo effect', 'with the right encouragement', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('the power of play', 'virtually every child', 'Cambridge IELTS 14', 'Test 3', 'p3', 'Cambridge IELTS 14 Test 3 — Passage 3'),
	('the psychology of innovation', 'innovation is key to business', 'Cambridge IELTS 10', 'Test 1', 'p3', 'Cambridge IELTS 10 Test 1 — Passage 3'),
	('the return of the huarango', 'the south coast of peru', 'Cambridge IELTS 15', 'Test 4', 'p1', 'Cambridge IELTS 15 Test 4 — Passage 1');
--> statement-breakpoint
INSERT INTO `_tmp_reading_meta_0094` (`norm_title`, `passage_clue`, `collection`, `test_group`, `part`, `part_source`) VALUES
	('the risks agriculture faces in developing countries', 'two things distinguish food', 'Cambridge IELTS 12', 'Test 2', 'p1', 'Cambridge IELTS 12 Test 2 — Passage 1'),
	('the science of sleep', 'sleep is not an optional', 'Actual Test', 'Passage 3', 'p3', 'Actual Test — Passage 3'),
	('the secret of staying young', 'native ant of the south', 'Cambridge IELTS 14', 'Test 4', 'p1', 'Cambridge IELTS 14 Test 4 — Passage 1'),
	('the significant role of mother tongue language in education', 'one consequence of population', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('the slow food organization', 'slow food began when carlo', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('the steam car', 'when primitive automobiles first', 'Cambridge IELTS 18', 'Test 3', 'p2', 'Cambridge IELTS 18 Test 3 — Passage 2'),
	('the step pyramid of djoser', 'the pyramids are the most', 'Cambridge IELTS 16', 'Test 1', 'p2', 'Cambridge IELTS 16 Test 1 — Passage 2'),
	('the story of silk', 'smooth material produced from the', 'Cambridge IELTS 11', 'Test 3', 'p1', 'Cambridge IELTS 11 Test 3 — Passage 1'),
	('the study of teens', 'may not have had culture', 'Forecast Quý 2-2025', 'Passage 2', 'p2', 'Forecast Quý 2-2025 — Passage 2'),
	('the thylacine', 'the extinct thylacine', 'Cambridge IELTS 17', 'Test 3', 'p1', 'Cambridge IELTS 17 Test 3 — Passage 1'),
	('the tuatara: past and future', 'the new zealand species of', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('the unselfish gene', 'psychologist gives his view on', 'Cambridge IELTS 19', 'Test 4', 'p3', 'Cambridge IELTS 19 Test 4 — Passage 3'),
	('the voynich manuscript', 'the starkly modern beinecke library', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('the white horse of uffington', 'the cutting of huge figures', 'Cambridge IELTS 16', 'Test 2', 'p1', 'Cambridge IELTS 16 Test 2 — Passage 1'),
	('the world''s first cities', 'the inhabitants of mesopotamia', 'Actual Test', 'Passage 1', 'p1', 'Actual Test — Passage 1'),
	('timekeeper: invention of marine chronometer', 'the middle of the', 'Actual Test', 'Passage 1', 'p1', 'Actual Test — Passage 1'),
	('timur gareyev - blindfold chess champion', 'chess player named timur gareyev', 'Cambridge IELTS 17', 'Test 4', 'p3', 'Cambridge IELTS 17 Test 4 — Passage 3'),
	('to catch a king', 'tells us the story of', 'Cambridge IELTS 17', 'Test 1', 'p3', 'Cambridge IELTS 17 Test 1 — Passage 3'),
	('traditional maori medicines', 'the maori are the indigenous', 'Actual Test', 'Passage 1', 'p1', 'Actual Test — Passage 1'),
	('tulip mania', 'centuries before anyone ever heard', 'Forecast Quý 2-2025', 'Passage 1', 'p1', 'Forecast Quý 2-2025 — Passage 1'),
	('tunnelling under the thames', 'the beginning of the', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('tv addiction', 'winn argued in the plug', 'Actual Test', 'Passage 1', 'p1', 'Actual Test — Passage 1'),
	('tv addiction 2', 'excessive cravings do not', 'Actual Test', 'Passage 3', 'p3', 'Actual Test — Passage 3'),
	('uk companies need more effective boards of directors', 'number of serious failures of', 'Cambridge IELTS 12', 'Test 4', 'p3', 'Cambridge IELTS 12 Test 4 — Passage 3'),
	('urban farming', 'urban farmers are trying', 'Cambridge IELTS 18', 'Test 1', 'p1', 'Cambridge IELTS 18 Test 1 — Passage 1');
--> statement-breakpoint
INSERT INTO `_tmp_reading_meta_0094` (`norm_title`, `passage_clue`, `collection`, `test_group`, `part`, `part_source`) VALUES
	('urban regeneration: an award-winning redevelopment project in berlin', 'kilometre south of berlin', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('water filter', 'ingenious invention is set to', 'Forecast Quý 2-2025', 'Passage 3', 'p3', 'Forecast Quý 2-2025 — Passage 3'),
	('we have star performers!', 'the difference between companies is', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('whale culture', 'most social scientists stubbornly', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('what are dreams?', 'many centuries ago', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('what destroyed the civilisation of easter island?', 'rapu nui as it is', 'Cambridge IELTS 11', 'Test 2', 'p2', 'Cambridge IELTS 11 Test 2 — Passage 2'),
	('what do babies know?', 'daniel haworth is settled into', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('what is a dinosaur?', 'although the name dinosaur is', 'Actual Test', 'Passage 3', 'p3', 'Actual Test — Passage 3'),
	('what is exploration?', 'are all explores', 'Cambridge IELTS 15', 'Test 1', 'p3', 'Cambridge IELTS 15 Test 1 — Passage 3'),
	('what makes a musical expert?', 'does that class of people', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3'),
	('what''s the purpose of gaining knowledge?', 'would found an institution where', 'Cambridge IELTS 12', 'Test 1', 'p3', 'Cambridge IELTS 12 Test 1 — Passage 3'),
	('whatever happened to the harappan civilisation?', 'whatever happened to the harappan', 'Cambridge IELTS 13', 'Test 3', 'p3', 'Cambridge IELTS 13 Test 3 — Passage 3'),
	('when evolution runs backwards', 'supposed to run backwards', 'Cambridge IELTS 10', 'Test 4', 'p3', 'Cambridge IELTS 10 Test 4 — Passage 3'),
	('who wrote shakespeare''s plays?', 'for another writer', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('why being bored is stimulating - and useful, too', 'all know how it feels', 'Cambridge IELTS 13', 'Test 1', 'p2', 'Cambridge IELTS 13 Test 1 — Passage 2'),
	('why companies should welcome disorder?', 'organisation is big business', 'Cambridge IELTS 14', 'Test 2', 'p3', 'Cambridge IELTS 14 Test 2 — Passage 3'),
	('why do we need arts?', 'world in which people spend', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('why don''t we sleep?', 'six million prescriptions for', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('why fairy tales are really scary tales?', 'people of every culture tell', 'Cambridge IELTS 15', 'Test 3', 'p3', 'Cambridge IELTS 15 Test 3 — Passage 3'),
	('why we need to protect polar bears?', 'polar bears are being increasingly', 'Cambridge IELTS 16', 'Test 1', 'p1', 'Cambridge IELTS 16 Test 1 — Passage 1'),
	('why zoos are good?', 'perfectly possible for many species', 'Cambridge IELTS 14', 'Test 4', 'p2', 'Cambridge IELTS 14 Test 4 — Passage 2'),
	('will eating less make you live longer', 'some refer to it', 'Collection', 'Passage 2', 'p2', 'Collection — Passage 2'),
	('wood: a valuable resource in new zealand''s economy', 'during the settlement of new', 'Collection', 'Passage 1', 'p1', 'Collection — Passage 1'),
	('world ecotourism in developing countries', 'according to the ecotourism society', 'Forecast Quý 2-2025', 'Passage 1', 'p1', 'Forecast Quý 2-2025 — Passage 1'),
	('yawning', 'provine began studying yawning in', 'Collection', 'Passage 3', 'p3', 'Collection — Passage 3');
--> statement-breakpoint
UPDATE `library_test`
SET
	`collection` = COALESCE((
		SELECT m.`collection`
		FROM `library_test_part` ltp
		INNER JOIN `_tmp_reading_meta_0094` m
			ON m.`norm_title` = LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '), CHAR(8216), ''''), CHAR(8217), ''''), CHAR(8211), '-'), CHAR(8212), '-'), CHAR(65306), ':'), CHAR(1088), 'p')))
			AND (m.`passage_clue` = '' OR INSTR(LOWER(ltp.`passage`), m.`passage_clue`) > 0)
		WHERE ltp.`test_id` = `library_test`.`id`
			AND ltp.`part` IN ('p1', m.`part`)
		LIMIT 1
	), `collection`),
	`test_group` = COALESCE((
		SELECT m.`test_group`
		FROM `library_test_part` ltp
		INNER JOIN `_tmp_reading_meta_0094` m
			ON m.`norm_title` = LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '), CHAR(8216), ''''), CHAR(8217), ''''), CHAR(8211), '-'), CHAR(8212), '-'), CHAR(65306), ':'), CHAR(1088), 'p')))
			AND (m.`passage_clue` = '' OR INSTR(LOWER(ltp.`passage`), m.`passage_clue`) > 0)
		WHERE ltp.`test_id` = `library_test`.`id`
			AND ltp.`part` IN ('p1', m.`part`)
		LIMIT 1
	), `test_group`),
	`updated_at` = cast(unixepoch('subsecond') * 1000 as integer)
WHERE `skill` = 'reading'
	AND (SELECT COUNT(*) FROM `library_test_part` ltp_c WHERE ltp_c.`test_id` = `library_test`.`id`) = 1
	AND (
		SELECT COUNT(*)
		FROM `library_test_part` ltp
		INNER JOIN `_tmp_reading_meta_0094` m
			ON m.`norm_title` = LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '), CHAR(8216), ''''), CHAR(8217), ''''), CHAR(8211), '-'), CHAR(8212), '-'), CHAR(65306), ':'), CHAR(1088), 'p')))
			AND (m.`passage_clue` = '' OR INSTR(LOWER(ltp.`passage`), m.`passage_clue`) > 0)
		WHERE ltp.`test_id` = `library_test`.`id`
			AND ltp.`part` IN ('p1', m.`part`)
	) = 1
	AND EXISTS (
		SELECT 1
		FROM `library_test_part` ltp
		INNER JOIN `_tmp_reading_meta_0094` m
			ON m.`norm_title` = LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '), CHAR(8216), ''''), CHAR(8217), ''''), CHAR(8211), '-'), CHAR(8212), '-'), CHAR(65306), ':'), CHAR(1088), 'p')))
			AND (m.`passage_clue` = '' OR INSTR(LOWER(ltp.`passage`), m.`passage_clue`) > 0)
		WHERE ltp.`test_id` = `library_test`.`id`
			AND ltp.`part` IN ('p1', m.`part`)
			AND (TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test`.`collection`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')) = '' OR LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test`.`collection`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))) IN ('unknown', LOWER(m.`collection`)) OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test`.`collection`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'step ielts') > 0 OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test`.`collection`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'step-ielts') > 0 OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test`.`collection`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'stepielts') > 0)
			AND (LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test`.`test_group`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))) IN ('', 'unknown', 'passage 1', 'p1', 'part 1', 'passage 2', 'p2', 'part 2', 'passage 3', 'p3', 'part 3', LOWER(m.`test_group`)) OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test`.`test_group`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'step ielts') > 0 OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test`.`test_group`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'step-ielts') > 0 OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test`.`test_group`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'stepielts') > 0)
			AND (
				`library_test`.`collection` IS NOT m.`collection`
				OR `library_test`.`test_group` IS NOT m.`test_group`
			)
	);
--> statement-breakpoint
UPDATE `library_test_part`
SET
	`part` = COALESCE((
		SELECT CASE
			WHEN `library_test_part`.`part` = 'p1' AND m.`part` IN ('p2', 'p3') THEN m.`part`
			ELSE `library_test_part`.`part`
		END
		FROM `library_test` lt
		INNER JOIN `_tmp_reading_meta_0094` m
			ON m.`norm_title` = LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(lt.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '), CHAR(8216), ''''), CHAR(8217), ''''), CHAR(8211), '-'), CHAR(8212), '-'), CHAR(65306), ':'), CHAR(1088), 'p')))
			AND (m.`passage_clue` = '' OR INSTR(LOWER(`library_test_part`.`passage`), m.`passage_clue`) > 0)
		WHERE lt.`id` = `library_test_part`.`test_id`
			AND lt.`skill` = 'reading'
			AND lt.`collection` = m.`collection`
			AND lt.`test_group` = m.`test_group`
		LIMIT 1
	), `part`),
	`source` = COALESCE((
		SELECT CASE
			WHEN (TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test_part`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')) = '' OR LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test_part`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))) = 'unknown' OR SUBSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test_part`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 1, 10) IN ('unknown — ', 'unknown - ') OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test_part`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'step ielts') > 0 OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test_part`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'step-ielts') > 0 OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test_part`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'stepielts') > 0) AND m.`part_source` <> '' THEN m.`part_source`
			ELSE `library_test_part`.`source`
		END
		FROM `library_test` lt
		INNER JOIN `_tmp_reading_meta_0094` m
			ON m.`norm_title` = LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(lt.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '), CHAR(8216), ''''), CHAR(8217), ''''), CHAR(8211), '-'), CHAR(8212), '-'), CHAR(65306), ':'), CHAR(1088), 'p')))
			AND (m.`passage_clue` = '' OR INSTR(LOWER(`library_test_part`.`passage`), m.`passage_clue`) > 0)
		WHERE lt.`id` = `library_test_part`.`test_id`
			AND lt.`skill` = 'reading'
			AND lt.`collection` = m.`collection`
			AND lt.`test_group` = m.`test_group`
		LIMIT 1
	), `source`),
	`title` = COALESCE((
		SELECT CASE
			WHEN `library_test_part`.`part` = 'p1' AND m.`part` IN ('p2', 'p3') THEN
				CASE
			WHEN TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test_part`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')) = 'Passage 1' THEN 'Passage ' || SUBSTR(m.`part`, 2)
			WHEN TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test_part`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')) = 'Reading Passage 1' THEN 'Reading Passage ' || SUBSTR(m.`part`, 2)
			WHEN SUBSTR(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test_part`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')), 1, 11) = 'Passage 1: ' THEN 'Passage ' || SUBSTR(m.`part`, 2) || ': ' || SUBSTR(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test_part`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')), 12)
			WHEN SUBSTR(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test_part`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')), 1, 19) = 'Reading Passage 1: ' THEN 'Reading Passage ' || SUBSTR(m.`part`, 2) || ': ' || SUBSTR(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test_part`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')), 20)
			WHEN LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test_part`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))) > 5 AND SUBSTR(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test_part`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')), LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test_part`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))) - 4, 5) = ' — P1' THEN SUBSTR(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test_part`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')), 1, LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test_part`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))) - 5) || ' — P' || SUBSTR(m.`part`, 2)
			ELSE `library_test_part`.`title`
		END
			ELSE `library_test_part`.`title`
		END
		FROM `library_test` lt
		INNER JOIN `_tmp_reading_meta_0094` m
			ON m.`norm_title` = LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(lt.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '), CHAR(8216), ''''), CHAR(8217), ''''), CHAR(8211), '-'), CHAR(8212), '-'), CHAR(65306), ':'), CHAR(1088), 'p')))
			AND (m.`passage_clue` = '' OR INSTR(LOWER(`library_test_part`.`passage`), m.`passage_clue`) > 0)
		WHERE lt.`id` = `library_test_part`.`test_id`
			AND lt.`skill` = 'reading'
			AND lt.`collection` = m.`collection`
			AND lt.`test_group` = m.`test_group`
		LIMIT 1
	), `title`),
	`updated_at` = cast(unixepoch('subsecond') * 1000 as integer)
WHERE (SELECT COUNT(*) FROM `library_test_part` ltp_c WHERE ltp_c.`test_id` = `library_test_part`.`test_id`) = 1
	AND (
		SELECT COUNT(*)
		FROM `library_test` lt
		INNER JOIN `_tmp_reading_meta_0094` m
			ON m.`norm_title` = LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(lt.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '), CHAR(8216), ''''), CHAR(8217), ''''), CHAR(8211), '-'), CHAR(8212), '-'), CHAR(65306), ':'), CHAR(1088), 'p')))
			AND (m.`passage_clue` = '' OR INSTR(LOWER(`library_test_part`.`passage`), m.`passage_clue`) > 0)
		WHERE lt.`id` = `library_test_part`.`test_id`
			AND lt.`skill` = 'reading'
			AND lt.`collection` = m.`collection`
			AND lt.`test_group` = m.`test_group`
	) = 1
	AND EXISTS (
		SELECT 1
		FROM `library_test` lt
		INNER JOIN `_tmp_reading_meta_0094` m
			ON m.`norm_title` = LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(lt.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '), CHAR(8216), ''''), CHAR(8217), ''''), CHAR(8211), '-'), CHAR(8212), '-'), CHAR(65306), ':'), CHAR(1088), 'p')))
			AND (m.`passage_clue` = '' OR INSTR(LOWER(`library_test_part`.`passage`), m.`passage_clue`) > 0)
		WHERE lt.`id` = `library_test_part`.`test_id`
			AND lt.`skill` = 'reading'
			AND lt.`collection` = m.`collection`
			AND lt.`test_group` = m.`test_group`
			AND (
				(`library_test_part`.`part` = 'p1' AND m.`part` IN ('p2', 'p3'))
				OR (
					(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test_part`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')) = '' OR LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test_part`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))) = 'unknown' OR SUBSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test_part`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 1, 10) IN ('unknown — ', 'unknown - ') OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test_part`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'step ielts') > 0 OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test_part`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'step-ielts') > 0 OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_test_part`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'stepielts') > 0)
					AND m.`part_source` <> ''
					AND `library_test_part`.`source` IS NOT m.`part_source`
				)
			)
	);
--> statement-breakpoint
UPDATE `assignment_test`
SET
	`collection` = COALESCE((
		SELECT lt.`collection`
		FROM `library_test` lt
		WHERE lt.`id` = `assignment_test`.`library_ref`
			AND lt.`skill` = 'reading'
		LIMIT 1
	), `collection`),
	`test_group` = COALESCE((
		SELECT lt.`test_group`
		FROM `library_test` lt
		WHERE lt.`id` = `assignment_test`.`library_ref`
			AND lt.`skill` = 'reading'
		LIMIT 1
	), `test_group`),
	`updated_at` = cast(unixepoch('subsecond') * 1000 as integer)
WHERE `skill` = 'reading'
	AND `library_ref` IS NOT NULL
	AND TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`library_ref`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')) <> ''
	AND (SELECT COUNT(*) FROM `assignment_test_part` atp_c WHERE atp_c.`test_id` = `assignment_test`.`id`) <= 1
	AND EXISTS (
		SELECT 1
		FROM `library_test` lt
		INNER JOIN `library_test_part` ltp ON ltp.`test_id` = lt.`id`
		INNER JOIN `_tmp_reading_meta_0094` m
			ON m.`norm_title` = LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(lt.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '), CHAR(8216), ''''), CHAR(8217), ''''), CHAR(8211), '-'), CHAR(8212), '-'), CHAR(65306), ':'), CHAR(1088), 'p')))
			AND (m.`passage_clue` = '' OR INSTR(LOWER(ltp.`passage`), m.`passage_clue`) > 0)
		WHERE lt.`id` = `assignment_test`.`library_ref`
			AND lt.`skill` = 'reading'
			AND (SELECT COUNT(*) FROM `library_test_part` ltp_c WHERE ltp_c.`test_id` = lt.`id`) = 1
			AND (
				SELECT COUNT(*)
				FROM `_tmp_reading_meta_0094` m2
				WHERE m2.`norm_title` = LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(lt.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '), CHAR(8216), ''''), CHAR(8217), ''''), CHAR(8211), '-'), CHAR(8212), '-'), CHAR(65306), ':'), CHAR(1088), 'p')))
					AND (m2.`passage_clue` = '' OR INSTR(LOWER(ltp.`passage`), m2.`passage_clue`) > 0)
			) = 1
			AND lt.`collection` = m.`collection`
			AND lt.`test_group` = m.`test_group`
			AND (TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_test`.`collection`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')) = '' OR LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_test`.`collection`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))) IN ('unknown', LOWER(lt.`collection`)) OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_test`.`collection`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'step ielts') > 0 OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_test`.`collection`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'step-ielts') > 0 OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_test`.`collection`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'stepielts') > 0)
			AND (LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_test`.`test_group`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))) IN ('', 'unknown', 'passage 1', 'p1', 'part 1', 'passage 2', 'p2', 'part 2', 'passage 3', 'p3', 'part 3', LOWER(lt.`test_group`)) OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_test`.`test_group`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'step ielts') > 0 OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_test`.`test_group`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'step-ielts') > 0 OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_test`.`test_group`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'stepielts') > 0)
			AND (
				`assignment_test`.`collection` IS NOT lt.`collection`
				OR `assignment_test`.`test_group` IS NOT lt.`test_group`
			)
	);
--> statement-breakpoint
CREATE TABLE `_tmp_blocked_prompt_0094` (`prompt_id` text PRIMARY KEY);
--> statement-breakpoint
INSERT OR IGNORE INTO `_tmp_blocked_prompt_0094` (`prompt_id`)
SELECT `prompt_id`
FROM `assignment_test_part`
GROUP BY `prompt_id`
HAVING COUNT(*) > 1;
--> statement-breakpoint
UPDATE `assignment_test_part`
SET
	`part` = COALESCE((
		SELECT ltp.`part`
		FROM `assignment_test` at
		INNER JOIN `library_test` lt ON lt.`id` = at.`library_ref`
		INNER JOIN `assignment_prompt` ap ON ap.`id` = `assignment_test_part`.`prompt_id`
		INNER JOIN `library_test_part` ltp ON ltp.`id` = SUBSTR(ap.`library_ref`, 19)
		WHERE at.`id` = `assignment_test_part`.`test_id`
			AND at.`skill` = 'reading'
			AND at.`library_ref` IS NOT NULL
			AND TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(at.`library_ref`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')) <> ''
			AND lt.`skill` = 'reading'
			AND at.`collection` = lt.`collection`
			AND at.`test_group` = lt.`test_group`
			AND ap.`org_id` = at.`org_id`
			AND ap.`skill` = 'reading'
			AND ap.`part` = 'p1'
			AND SUBSTR(ap.`library_ref`, 1, 18) = 'library_test_part:'
			AND TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(SUBSTR(ap.`library_ref`, 19), ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')) <> ''
			AND ltp.`test_id` = lt.`id`
			AND ltp.`part` IN ('p2', 'p3')
			AND ap.`passage` = ltp.`passage`
		LIMIT 1
	), `part`),
	`position` = COALESCE((
		SELECT CASE
			WHEN ltp.`part` = 'p2' THEN 1
			WHEN ltp.`part` = 'p3' THEN 2
			ELSE 0
		END
		FROM `assignment_test` at
		INNER JOIN `library_test` lt ON lt.`id` = at.`library_ref`
		INNER JOIN `assignment_prompt` ap ON ap.`id` = `assignment_test_part`.`prompt_id`
		INNER JOIN `library_test_part` ltp ON ltp.`id` = SUBSTR(ap.`library_ref`, 19)
		WHERE at.`id` = `assignment_test_part`.`test_id`
			AND at.`skill` = 'reading'
			AND at.`library_ref` IS NOT NULL
			AND TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(at.`library_ref`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')) <> ''
			AND lt.`skill` = 'reading'
			AND at.`collection` = lt.`collection`
			AND at.`test_group` = lt.`test_group`
			AND ap.`org_id` = at.`org_id`
			AND ap.`skill` = 'reading'
			AND ap.`part` = 'p1'
			AND SUBSTR(ap.`library_ref`, 1, 18) = 'library_test_part:'
			AND TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(SUBSTR(ap.`library_ref`, 19), ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')) <> ''
			AND ltp.`test_id` = lt.`id`
			AND ltp.`part` IN ('p2', 'p3')
			AND ap.`passage` = ltp.`passage`
		LIMIT 1
	), `position`)
WHERE `part` = 'p1'
	AND NOT EXISTS (
		SELECT 1
		FROM `assignment_test_part` other
		WHERE other.`test_id` = `assignment_test_part`.`test_id`
			AND other.`id` <> `assignment_test_part`.`id`
	)
	AND NOT EXISTS (
		SELECT 1
		FROM `_tmp_blocked_prompt_0094` b
		WHERE b.`prompt_id` = `assignment_test_part`.`prompt_id`
	)
	AND EXISTS (
		SELECT 1
		FROM `assignment_test` at
		INNER JOIN `library_test` lt ON lt.`id` = at.`library_ref`
		INNER JOIN `assignment_prompt` ap ON ap.`id` = `assignment_test_part`.`prompt_id`
		INNER JOIN `library_test_part` ltp ON ltp.`id` = SUBSTR(ap.`library_ref`, 19)
		INNER JOIN `_tmp_reading_meta_0094` m
			ON m.`norm_title` = LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(lt.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '), CHAR(8216), ''''), CHAR(8217), ''''), CHAR(8211), '-'), CHAR(8212), '-'), CHAR(65306), ':'), CHAR(1088), 'p')))
			AND (m.`passage_clue` = '' OR INSTR(LOWER(ltp.`passage`), m.`passage_clue`) > 0)
		WHERE at.`id` = `assignment_test_part`.`test_id`
			AND at.`skill` = 'reading'
			AND at.`library_ref` IS NOT NULL
			AND TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(at.`library_ref`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')) <> ''
			AND lt.`skill` = 'reading'
			AND (SELECT COUNT(*) FROM `library_test_part` ltp_c WHERE ltp_c.`test_id` = lt.`id`) = 1
			AND lt.`collection` = m.`collection`
			AND lt.`test_group` = m.`test_group`
			AND at.`collection` = lt.`collection`
			AND at.`test_group` = lt.`test_group`
			AND ap.`org_id` = at.`org_id`
			AND ap.`skill` = 'reading'
			AND ap.`part` = 'p1'
			AND SUBSTR(ap.`library_ref`, 1, 18) = 'library_test_part:'
			AND TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(SUBSTR(ap.`library_ref`, 19), ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')) <> ''
			AND ltp.`test_id` = lt.`id`
			AND ltp.`part` = m.`part`
			AND ltp.`part` IN ('p2', 'p3')
			AND ap.`passage` = ltp.`passage`
	);
--> statement-breakpoint
INSERT OR IGNORE INTO `_tmp_blocked_prompt_0094` (`prompt_id`)
SELECT DISTINCT atp.`prompt_id`
FROM `assignment_test_part` atp
INNER JOIN `assignment_test` at ON at.`id` = atp.`test_id`
INNER JOIN `assignment_prompt` ap ON ap.`id` = atp.`prompt_id`
INNER JOIN `library_test_part` ltp
	ON SUBSTR(ap.`library_ref`, 1, 18) = 'library_test_part:'
	AND TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(SUBSTR(ap.`library_ref`, 19), ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')) <> ''
	AND ltp.`id` = SUBSTR(ap.`library_ref`, 19)
INNER JOIN `library_test` lt ON lt.`id` = ltp.`test_id`
WHERE ap.`skill` = 'reading'
	AND (
		atp.`part` <> ltp.`part`
		OR at.`skill` <> 'reading'
		OR at.`org_id` <> ap.`org_id`
		OR at.`library_ref` IS NOT lt.`id`
		OR at.`collection` IS NOT lt.`collection`
		OR at.`test_group` IS NOT lt.`test_group`
		OR EXISTS (
			SELECT 1
			FROM `assignment_test_part` other
			WHERE other.`test_id` = atp.`test_id`
				AND other.`id` <> atp.`id`
		)
	);
--> statement-breakpoint
UPDATE `assignment_prompt`
SET
	`part` = COALESCE((
		SELECT CASE
			WHEN `assignment_prompt`.`part` = 'p1' AND ltp.`part` IN ('p2', 'p3') THEN ltp.`part`
			ELSE `assignment_prompt`.`part`
		END
		FROM `library_test_part` ltp
		INNER JOIN `library_test` lt ON lt.`id` = ltp.`test_id`
		WHERE ltp.`id` = SUBSTR(`assignment_prompt`.`library_ref`, 19)
			AND lt.`skill` = 'reading'
		LIMIT 1
	), `part`),
	`source` = COALESCE((
		SELECT CASE
			WHEN (`assignment_prompt`.`part` = ltp.`part` OR (`assignment_prompt`.`part` = 'p1' AND ltp.`part` IN ('p2', 'p3')))
				AND (TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_prompt`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')) = '' OR LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_prompt`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))) = 'unknown' OR SUBSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_prompt`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 1, 10) IN ('unknown — ', 'unknown - ') OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_prompt`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'step ielts') > 0 OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_prompt`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'step-ielts') > 0 OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_prompt`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'stepielts') > 0)
				AND ltp.`source` <> ''
			THEN ltp.`source`
			ELSE `assignment_prompt`.`source`
		END
		FROM `library_test_part` ltp
		INNER JOIN `library_test` lt ON lt.`id` = ltp.`test_id`
		WHERE ltp.`id` = SUBSTR(`assignment_prompt`.`library_ref`, 19)
			AND lt.`skill` = 'reading'
		LIMIT 1
	), `source`),
	`title` = COALESCE((
		SELECT CASE
			WHEN `assignment_prompt`.`part` = 'p1' AND ltp.`part` IN ('p2', 'p3') THEN
				CASE
			WHEN TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_prompt`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')) = 'Passage 1' THEN 'Passage ' || SUBSTR(ltp.`part`, 2)
			WHEN TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_prompt`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')) = 'Reading Passage 1' THEN 'Reading Passage ' || SUBSTR(ltp.`part`, 2)
			WHEN SUBSTR(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_prompt`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')), 1, 11) = 'Passage 1: ' THEN 'Passage ' || SUBSTR(ltp.`part`, 2) || ': ' || SUBSTR(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_prompt`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')), 12)
			WHEN SUBSTR(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_prompt`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')), 1, 19) = 'Reading Passage 1: ' THEN 'Reading Passage ' || SUBSTR(ltp.`part`, 2) || ': ' || SUBSTR(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_prompt`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')), 20)
			WHEN LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_prompt`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))) > 5 AND SUBSTR(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_prompt`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')), LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_prompt`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))) - 4, 5) = ' — P1' THEN SUBSTR(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_prompt`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')), 1, LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_prompt`.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))) - 5) || ' — P' || SUBSTR(ltp.`part`, 2)
			ELSE `assignment_prompt`.`title`
		END
			ELSE `assignment_prompt`.`title`
		END
		FROM `library_test_part` ltp
		INNER JOIN `library_test` lt ON lt.`id` = ltp.`test_id`
		WHERE ltp.`id` = SUBSTR(`assignment_prompt`.`library_ref`, 19)
			AND lt.`skill` = 'reading'
		LIMIT 1
	), `title`)
WHERE `skill` = 'reading'
	AND `library_ref` IS NOT NULL
	AND SUBSTR(`library_ref`, 1, 18) = 'library_test_part:'
	AND TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(SUBSTR(`library_ref`, 19), ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')) <> ''
	AND NOT EXISTS (
		SELECT 1
		FROM `_tmp_blocked_prompt_0094` b
		WHERE b.`prompt_id` = `assignment_prompt`.`id`
	)
	AND EXISTS (
		SELECT 1
		FROM `library_test_part` ltp
		INNER JOIN `library_test` lt ON lt.`id` = ltp.`test_id`
		INNER JOIN `_tmp_reading_meta_0094` m
			ON m.`norm_title` = LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(lt.`title`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '), CHAR(8216), ''''), CHAR(8217), ''''), CHAR(8211), '-'), CHAR(8212), '-'), CHAR(65306), ':'), CHAR(1088), 'p')))
			AND (m.`passage_clue` = '' OR INSTR(LOWER(ltp.`passage`), m.`passage_clue`) > 0)
		WHERE ltp.`id` = SUBSTR(`assignment_prompt`.`library_ref`, 19)
			AND lt.`skill` = 'reading'
			AND (SELECT COUNT(*) FROM `library_test_part` ltp_c WHERE ltp_c.`test_id` = lt.`id`) = 1
			AND lt.`collection` = m.`collection`
			AND lt.`test_group` = m.`test_group`
			AND ltp.`part` = m.`part`
			AND `assignment_prompt`.`passage` = ltp.`passage`
			AND (
				(`assignment_prompt`.`part` = 'p1' AND ltp.`part` IN ('p2', 'p3'))
				OR (
					(`assignment_prompt`.`part` = ltp.`part` OR (`assignment_prompt`.`part` = 'p1' AND ltp.`part` IN ('p2', 'p3')))
					AND (TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_prompt`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' ')) = '' OR LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_prompt`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))) = 'unknown' OR SUBSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_prompt`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 1, 10) IN ('unknown — ', 'unknown - ') OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_prompt`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'step ielts') > 0 OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_prompt`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'step-ielts') > 0 OR INSTR(LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`assignment_prompt`.`source`, ''), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), CHAR(160), ' '))), 'stepielts') > 0)
					AND ltp.`source` <> ''
					AND `assignment_prompt`.`source` IS NOT ltp.`source`
				)
			)
	);
--> statement-breakpoint
DROP TABLE IF EXISTS `_tmp_blocked_prompt_0094`;
--> statement-breakpoint
DROP TABLE IF EXISTS `_tmp_reading_meta_0094`;
