use super::*;

/// The two halves of the mapping have to agree, or a material would read another's frame.
#[test]
fn every_material_has_its_own_slot_and_the_list_is_in_slot_order() {
    for (index, material) in MATERIALS.iter().enumerate() {
        assert_eq!(slot(*material), index, "{material:?}");
    }
}
