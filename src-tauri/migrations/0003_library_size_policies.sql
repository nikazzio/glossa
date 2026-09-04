-- Come chiedere le misure a una biblioteca.
--
-- Sta fuori dal profilo di rete di proposito: un profilo è un *ritmo* e due
-- biblioteche possono meritare la stessa prudenza e servire misure diverse.
-- Tenere le due cose nella stessa riga voleva dire duplicare un ritmo tarato
-- sul campo solo per cambiare una misura.
--
-- Senza riga vale «decidi tu», che è il comportamento di sempre: la tabella
-- nasce vuota e nessuna biblioteca cambia modo di funzionare.
CREATE TABLE IF NOT EXISTS library_size_policies (
  library_key TEXT PRIMARY KEY,
  policy TEXT NOT NULL
);
