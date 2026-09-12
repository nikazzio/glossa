//! Prove del riconoscimento: per ogni biblioteca, le forme che un
//! ricercatore scrive davvero e quelle che non devono essere accettate.

use super::*;

#[test]
fn vatican_shelfmarks_reach_the_same_manuscript_however_they_are_written() {
    for written in [
        "Urb. lat. 1779",
        "urb lat 1779",
        "urb-lat-1779",
        "MSS_Urb.lat.1779",
        "Urblat1779",
    ] {
        let resolved = resolve(ResolverKind::Vatican, written)
            .unwrap_or_else(|| panic!("«{written}» dovrebbe risolversi"));
        assert_eq!(
            resolved.manifest_url,
            "https://digi.vatlib.it/iiif/MSS_Urb.lat.1779/manifest.json"
        );
        assert_eq!(resolved.strength, Strength::Strong);
    }
}

#[test]
fn a_vatican_shelfmark_without_series_keeps_its_shape() {
    let resolved = resolve(ResolverKind::Vatican, "Borg. 42").expect("segnatura senza serie");
    assert_eq!(resolved.doc_id, "MSS_Borg.42");
}

#[test]
fn free_text_is_not_mistaken_for_a_vatican_shelfmark() {
    assert!(resolve(ResolverKind::Vatican, "libro d'ore miniato").is_none());
    assert!(resolve(ResolverKind::Vatican, "urb lat").is_none());
}

#[test]
fn a_vatican_reading_page_resolves_to_its_manifest() {
    let resolved = resolve(
        ResolverKind::Vatican,
        "https://digi.vatlib.it/view/MSS_Vat.lat.3225",
    )
    .expect("pagina di lettura");
    assert_eq!(
        resolved.manifest_url,
        "https://digi.vatlib.it/iiif/MSS_Vat.lat.3225/manifest.json"
    );
}

#[test]
fn gallica_finds_the_ark_wherever_it_sits_in_the_address() {
    for written in [
        "https://gallica.bnf.fr/ark:/12148/bpt6k9604118j",
        "https://gallica.bnf.fr/ark:/12148/bpt6k9604118j/f1.image",
        "https://gallica.bnf.fr/iiif/ark:/12148/bpt6k9604118j/manifest.json",
    ] {
        let resolved = resolve(ResolverKind::Gallica, written)
            .unwrap_or_else(|| panic!("«{written}» dovrebbe risolversi"));
        assert_eq!(
            resolved.manifest_url,
            "https://gallica.bnf.fr/iiif/ark:/12148/bpt6k9604118j/manifest.json"
        );
        assert_eq!(resolved.strength, Strength::Strong);
    }
}

#[test]
fn an_address_with_accents_does_not_break_the_gallica_recognition() {
    // Cercare in una stringa e tagliare in un'altra reggeva finché erano
    // lunghe uguali: con una lettera accentata prima dell'ARK non lo è più.
    let resolved = resolve(
        ResolverKind::Gallica,
        "https://gallica.bnf.fr/collection/Curiosités/ark:/12148/btv1b84260335",
    )
    .expect("indirizzo con accenti");
    assert_eq!(
        resolved.manifest_url,
        "https://gallica.bnf.fr/iiif/ark:/12148/btv1b84260335/manifest.json"
    );
}

#[test]
fn a_bare_gallica_identifier_is_only_a_guess() {
    let resolved = resolve(ResolverKind::Gallica, "bpt6k9604118j").expect("identificativo nudo");
    assert_eq!(resolved.strength, Strength::Weak);
}

#[test]
fn heidelberg_shelfmarks_are_not_read_as_gallica_identifiers() {
    assert!(resolve(ResolverKind::Gallica, "cpg848").is_none());
}

#[test]
fn ecodices_accepts_compound_ids_and_both_addresses() {
    for written in [
        "bbb-0264",
        "https://www.e-codices.unifr.ch/en/bbb/0264",
        "https://www.e-codices.unifr.ch/metadata/iiif/bbb-0264/manifest.json",
    ] {
        let resolved = resolve(ResolverKind::Ecodices, written)
            .unwrap_or_else(|| panic!("«{written}» dovrebbe risolversi"));
        assert_eq!(
            resolved.manifest_url,
            "https://www.e-codices.unifr.ch/metadata/iiif/bbb-0264/manifest.json"
        );
    }
}

#[test]
fn ecodices_ignores_words_that_are_not_shelfmarks() {
    assert!(resolve(ResolverKind::Ecodices, "graduale").is_none());
}

#[test]
fn an_internet_archive_detail_page_still_resolves() {
    let resolved = resolve(
        ResolverKind::ArchiveOrg,
        "https://archive.org/details/dellarchitettura",
    )
    .expect("pagina di dettaglio");
    assert_eq!(
        resolved.manifest_url,
        "https://iiif.archive.org/iiif/dellarchitettura/manifest.json"
    );
}

#[test]
fn an_already_resolved_archive_org_manifest_address_resolves_again() {
    // Risincronizzare un'opera passa proprio l'indirizzo del manifesto
    // già salvato (non la pagina di dettaglio): senza questo, la
    // risincronizzazione delle fonti Internet Archive non trovava mai
    // niente.
    let resolved = resolve(
        ResolverKind::ArchiveOrg,
        "https://iiif.archive.org/iiif/dellarchitettura/manifest.json",
    )
    .expect("manifesto già risolto");
    assert_eq!(
        resolved.manifest_url,
        "https://iiif.archive.org/iiif/dellarchitettura/manifest.json"
    );
}

#[test]
fn the_library_of_congress_address_becomes_its_manifest() {
    for written in [
        "https://www.loc.gov/item/2021667925/",
        "https://www.loc.gov/resource/2021667925/?sp=3",
        "https://loc.gov/item/2021667925",
    ] {
        let resolved = resolve(ResolverKind::Loc, written).expect("indirizzo riconosciuto");
        assert_eq!(resolved.doc_id, "2021667925", "scritto come {written}");
        assert_eq!(
            resolved.manifest_url,
            "https://www.loc.gov/item/2021667925/manifest.json"
        );
    }
}

#[test]
fn the_page_number_is_not_part_of_the_library_of_congress_item() {
    // Sulle riproduzioni il catalogo attacca `:sp12` all'identificativo:
    // è la pagina che stai guardando, non l'opera.
    let resolved = resolve(
        ResolverKind::Loc,
        "https://www.loc.gov/resource/gdc.123:sp12/",
    )
    .expect("indirizzo riconosciuto");
    assert_eq!(resolved.doc_id, "gdc.123");
}

#[test]
fn a_bare_word_is_not_a_library_of_congress_address() {
    // Senza l'indirizzo intero, «2021667925» non si distingue da una
    // parola da cercare: restituire un manifesto inventato manderebbe il
    // visore su una pagina che non esiste.
    assert!(resolve(ResolverKind::Loc, "2021667925").is_none());
    assert!(resolve(ResolverKind::Loc, "https://example.org/item/123").is_none());
}

#[test]
fn harvard_reads_the_token_wherever_it_is_written() {
    for written in [
        "drs:123456",
        "https://iiif.lib.harvard.edu/manifests/drs:123456",
        "https://iiif.lib.harvard.edu/manifests/view/drs:123456",
    ] {
        let resolved = resolve(ResolverKind::Harvard, written).expect("gettone riconosciuto");
        assert_eq!(resolved.doc_id, "drs:123456", "scritto come {written}");
        assert_eq!(
            resolved.manifest_url,
            "https://iiif.lib.harvard.edu/manifests/drs:123456"
        );
    }
    // Il numero di catalogo non porta a un manifesto: è un'altra cosa.
    assert!(resolve(ResolverKind::Harvard, "990123456780203941").is_none());
    assert!(resolve(ResolverKind::Harvard, "drs:12").is_none());
}

#[test]
fn cambridge_accepts_the_viewer_address_and_a_shelfmark_with_dashes() {
    let from_url = resolve(
        ResolverKind::Cambridge,
        "https://cudl.lib.cam.ac.uk/view/MS-ADD-03996/1",
    )
    .expect("indirizzo del visore");
    assert_eq!(from_url.doc_id, "MS-ADD-03996");
    assert_eq!(
        from_url.manifest_url,
        "https://cudl.lib.cam.ac.uk/iiif/MS-ADD-03996"
    );

    let from_shelfmark =
        resolve(ResolverKind::Cambridge, "ms-add-03996").expect("segnatura con i trattini");
    assert_eq!(from_shelfmark.doc_id, "MS-ADD-03996");

    // Due parole separate da un trattino non sono una segnatura.
    assert!(resolve(ResolverKind::Cambridge, "book-hours").is_none());
    assert!(resolve(ResolverKind::Cambridge, "libro d'ore").is_none());
}

#[test]
fn bodleian_works_are_identified_by_uuid() {
    let resolved = resolve(
        ResolverKind::Bodleian,
        "https://digital.bodleian.ox.ac.uk/objects/080f88f5-7586-4b8a-8064-63ab3495393c/",
    )
    .expect("indirizzo del visore");
    assert_eq!(resolved.doc_id, "080f88f5-7586-4b8a-8064-63ab3495393c");
    assert_eq!(
        resolved.manifest_url,
        "https://iiif.bodleian.ox.ac.uk/iiif/manifest/080f88f5-7586-4b8a-8064-63ab3495393c.json"
    );
    assert!(resolve(ResolverKind::Bodleian, "080f88f5-7586").is_none());
}

#[test]
fn heidelberg_reads_its_own_shelfmarks_and_viewer_addresses() {
    for (written, expected) in [
        ("cpg123", "cpg123"),
        ("CPG123", "cpg123"),
        ("https://digi.ub.uni-heidelberg.de/diglit/cpg848", "cpg848"),
        (
            "https://digi.ub.uni-heidelberg.de/diglit/iiif/cpg848/manifest.json",
            "cpg848",
        ),
    ] {
        let resolved = resolve(ResolverKind::Heidelberg, written).expect("riconosciuto");
        assert_eq!(resolved.doc_id, expected, "scritto come {written}");
    }
    assert!(resolve(ResolverKind::Heidelberg, "codice palatino").is_none());
}

#[test]
fn estense_finds_the_uuid_inside_the_address() {
    let resolved = resolve(
            ResolverKind::Estense,
            "https://jarvis.edl.beniculturali.it/images/viewers/mirador/?manifest=https://jarvis.edl.beniculturali.it/meta/iiif/0a1b2c3d-4e5f-6789-abcd-ef0123456789/manifest",
        )
        .expect("uuid dentro l'indirizzo");
    assert_eq!(resolved.doc_id, "0a1b2c3d-4e5f-6789-abcd-ef0123456789");
    assert_eq!(
            resolved.manifest_url,
            "https://jarvis.edl.beniculturali.it/meta/iiif/0a1b2c3d-4e5f-6789-abcd-ef0123456789/manifest"
        );
}

#[test]
fn institut_accepts_the_number_and_the_addresses_that_contain_it() {
    for written in [
        "17837",
        "https://bibnum.institutdefrance.fr/viewer/17837",
        "https://bibnum.institutdefrance.fr/records/item/17837-un-manoscritto",
    ] {
        let resolved = resolve(ResolverKind::Institut, written).expect("riconosciuto");
        assert_eq!(resolved.doc_id, "17837", "scritto come {written}");
        assert_eq!(
            resolved.manifest_url,
            "https://bibnum.institutdefrance.fr/iiif/17837/manifest"
        );
    }
    assert!(resolve(ResolverKind::Institut, "12").is_none());
}

#[test]
fn the_swiss_platforms_take_the_number_of_the_record() {
    for (kind, written, host) in [
        (ResolverKind::ERara, "198", "e-rara"),
        (
            ResolverKind::ERara,
            "https://www.e-rara.ch/zut/content/titleinfo/198",
            "e-rara",
        ),
        (
            ResolverKind::ERara,
            "https://www.e-rara.ch/i3f/v20/198/manifest",
            "e-rara",
        ),
        (ResolverKind::EManuscripta, "992548", "e-manuscripta"),
        (
            ResolverKind::EManuscripta,
            "https://www.e-manuscripta.ch/zuz/content/zoom/992548",
            "e-manuscripta",
        ),
    ] {
        let resolved = resolve(kind, written).expect("riconosciuto");
        assert!(
            resolved.manifest_url.contains(host) && resolved.manifest_url.ends_with("/manifest"),
            "scritto come {written}"
        );
    }
    // Un indirizzo di un'altra piattaforma non diventa un'opera svizzera.
    assert!(resolve(ResolverKind::ERara, "https://example.org/titleinfo/198").is_none());
}

#[test]
fn munich_records_start_with_bsb() {
    for written in [
        "bsb00026283",
        "BSB00026283",
        "https://www.digitale-sammlungen.de/en/view/bsb00026283",
        "https://api.digitale-sammlungen.de/iiif/presentation/v2/bsb00026283/manifest",
    ] {
        let resolved = resolve(ResolverKind::Mdz, written).expect("riconosciuto");
        assert_eq!(resolved.doc_id, "bsb00026283", "scritto come {written}");
        assert_eq!(
            resolved.manifest_url,
            "https://api.digitale-sammlungen.de/iiif/presentation/v2/bsb00026283/manifest"
        );
    }
    assert!(resolve(ResolverKind::Mdz, "26283").is_none());
}

#[test]
fn a_europeana_page_link_opens_the_work_without_the_key() {
    for written in [
        "https://www.europeana.eu/en/item/2020903/KKSgb2947_37",
        "https://www.europeana.eu/it/item/2020903/KKSgb2947_37?query=dante",
        "https://iiif.europeana.eu/presentation/2020903/KKSgb2947_37/manifest",
    ] {
        let resolved = resolve(ResolverKind::Europeana, written).expect("riconosciuto");
        assert_eq!(
            resolved.manifest_url,
            "https://iiif.europeana.eu/presentation/2020903/KKSgb2947_37/manifest",
            "scritto come {written}"
        );
    }
    // Una parola da cercare non è una scheda.
    assert!(resolve(ResolverKind::Europeana, "divina commedia").is_none());
    // E nemmeno l'indirizzo di un altro sito che per caso contiene `/item/`:
    // aprirlo come scheda di Europeana manderebbe il visore su un manifesto
    // inventato invece di cercare quelle parole.
    assert!(resolve(
        ResolverKind::Europeana,
        "https://example.org/item/2020903/work"
    )
    .is_none());
}

#[test]
fn a_pasted_manifest_address_works_for_libraries_without_their_own_recognition() {
    let resolved = resolve(
        ResolverKind::Generic,
        "https://iiif.lib.harvard.edu/manifests/drs:1234",
    )
    .expect("indirizzo diretto");
    assert_eq!(resolved.strength, Strength::Strong);
}
