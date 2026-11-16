use super::*;

fn arguments(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_owned()).collect()
}

#[test]
fn the_scene_is_the_argument_after_the_flag() {
    let given = arguments(&["iso-core", "--scene", "scenes/shore.json"]);

    assert_eq!(
        scene_argument(given.iter()),
        Some("scenes/shore.json".to_owned())
    );
}

#[test]
fn the_flag_also_takes_its_value_joined_by_an_equals_sign() {
    let given = arguments(&["iso-core", "--scene=scene.json"]);

    assert_eq!(scene_argument(given.iter()), Some("scene.json".to_owned()));
}

#[test]
fn a_run_with_no_flag_runs_no_scene() {
    let given = arguments(&["iso-core", "--maker"]);

    assert_eq!(scene_argument(given.iter()), None);
}

#[test]
fn a_flag_with_nothing_after_it_runs_no_scene() {
    let given = arguments(&["iso-core", "--scene"]);

    assert_eq!(scene_argument(given.iter()), None);
}

#[test]
fn the_output_goes_next_to_the_scene_file() {
    let out = out_dir(Path::new("scenes/shore/scene.json"), "shots");

    assert_eq!(out, Path::new("scenes/shore/shots"));
}

#[test]
fn a_scene_in_the_working_directory_writes_into_it() {
    let out = out_dir(Path::new("scene.json"), "shots");

    assert_eq!(out, Path::new("shots"));
}

#[test]
fn an_absolute_output_is_taken_as_it_is() {
    let out = out_dir(Path::new("scenes/scene.json"), "/tmp/shots");

    assert_eq!(out, Path::new("/tmp/shots"));
}

#[test]
fn a_shot_is_written_under_the_output_directory() {
    let path = shot_path(Path::new("scenes/shots"), "antes.png");

    assert_eq!(path, Some(PathBuf::from("scenes/shots/antes.png")));
}

#[test]
fn a_name_that_climbs_out_of_the_output_directory_writes_nothing() {
    assert_eq!(shot_path(Path::new("shots"), "../antes.png"), None);
    assert_eq!(shot_path(Path::new("shots"), "nested/antes.png"), None);
}
