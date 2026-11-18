use super::*;

#[test]
fn clock_starts_at_eight_and_advances_by_ticks() {
    let mut clock = WorldClock::default();
    assert_eq!(
        clock_time(clock.tick),
        ClockTime {
            day: 0,
            hour: 8,
            minute: 0
        }
    );
    assert_eq!(
        clock.advance(TICKS_PER_DAY).unwrap(),
        WORLD_START_TICK + TICKS_PER_DAY
    );
    assert_eq!(
        clock_time(clock.tick),
        ClockTime {
            day: 1,
            hour: 8,
            minute: 0
        }
    );
    assert_eq!(format_clock_time(clock_time(clock.tick)), "08:00");
}

#[test]
fn advance_overflow_does_not_mutate() {
    let mut clock = WorldClock::new(u64::MAX);
    assert_eq!(clock.advance(1), Err(ClockOverflow));
    assert_eq!(clock.tick, u64::MAX);
}
