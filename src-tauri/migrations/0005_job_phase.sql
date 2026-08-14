-- Fase corrente di un lavoro: cosa sta facendo adesso, dentro lo stato.
--
-- Lo stato dice se il lavoro gira, aspetta o è finito; la fase dice a che punto
-- del proprio mestiere è arrivato — leggere il manifesto, scegliere la
-- risoluzione, scaricare le carte. Il vocabolario lo decide ogni tipo di lavoro:
-- il riconoscimento testo dirà altre cose. È una chiave breve, tradotta
-- dall'interfaccia, non una frase: le frasi cambiano lingua, le chiavi no.
ALTER TABLE jobs ADD COLUMN phase TEXT;
