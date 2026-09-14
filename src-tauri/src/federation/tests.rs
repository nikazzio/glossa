use super::*;
use rusqlite::Connection;

fn database() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(include_str!("../../migrations/0001_baseline_2_0.sql"))
        .unwrap();
    conn.execute_batch("PRAGMA foreign_keys=ON").unwrap();
    conn
}

#[test]
fn invalid_criteria_are_rejected_before_a_job_exists() {
    assert!(Criteria::default().validate().is_err());
    assert!(Criteria {
        query: "dante".into(),
        year_from: Some(1600),
        year_to: Some(1400),
        ..Default::default()
    }
    .validate()
    .is_err());
    assert!(Criteria {
        query: "dante".into(),
        ..Default::default()
    }
    .validate()
    .is_ok());
}

#[test]
fn page_checkpoint_is_idempotent_and_history_survives_job_cleanup() {
    let conn = database();
    let criteria = serde_json::to_string(&Criteria {
        query: "dante".into(),
        ..Default::default()
    })
    .unwrap();
    let tx = conn.unchecked_transaction().unwrap();
    tx.execute("INSERT INTO search_runs(id,criteria,providers,group_id) VALUES('s',?1,'[\"gallica\"]','s')",[criteria]).unwrap();
    let config = SearchConfig {
        search_id: "s".into(),
        provider_key: "gallica".into(),
        result_set_id: "set".into(),
        page: 1,
        fresh: false,
    };
    let job = store::execution(&tx, &config, 1, "first", "dante").unwrap();
    crate::jobs::store::create(&tx, &job).unwrap();
    tx.commit().unwrap();
    let page = crate::iiif::discovery::SearchPage {
        results: vec![],
        has_more: true,
    };
    store::save_page(&conn, &job.id, &config, &page).unwrap();
    store::save_page(&conn, &job.id, &config, &page).unwrap();
    assert_eq!(
        store::results_for_execution(&conn, "s", None)
            .unwrap()
            .len(),
        1
    );
    assert!(store::run(&conn, "s").unwrap().executions[0].has_more);
    crate::jobs::store::set_status(&conn, &job.id, crate::jobs::JobStatus::Completed).unwrap();
    assert_eq!(crate::jobs::store::forget_finished(&conn, None).unwrap(), 0);
    assert!(store::run(&conn, "s").is_ok());
}

#[test]
fn failed_transaction_leaves_no_partial_search() {
    let conn = database();
    {
        let tx = conn.unchecked_transaction().unwrap();
        tx.execute(
            "INSERT INTO search_runs(id,criteria,providers,group_id) VALUES('s','{}','[]','s')",
            [],
        )
        .unwrap();
        assert!(tx
            .execute(
                "INSERT INTO search_runs(id,criteria,providers,group_id) VALUES('s','{}','[]','s')",
                []
            )
            .is_err());
    }
    assert!(!store::exists(&conn, "s").unwrap());
}

#[test]
fn queued_searches_are_recovered_without_restarting_network_requests() {
    let conn = database();
    let job = crate::jobs::store::NewJob {
        id: "queued".into(),
        job_type: JOB_TYPE.into(),
        priority: 0,
        config: "{}".into(),
        max_attempts: 1,
        depends_on_job_id: None,
        workspace_id: None,
        message: None,
    };
    crate::jobs::store::create(&conn, &job).unwrap();
    assert_eq!(crate::jobs::store::interrupted(&conn).unwrap().len(), 1);
}

#[test]
fn remote_urls_and_unknown_material_filters_are_not_federated_queries() {
    assert!(Criteria {
        query: "https://example.org/manifest".into(),
        ..Default::default()
    }
    .validate()
    .is_err());
    assert!(Criteria {
        query: "Dante".into(),
        material: "invented".into(),
        ..Default::default()
    }
    .validate()
    .is_err());
}
