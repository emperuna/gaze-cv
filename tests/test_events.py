import unittest
from gaze.events import MovementMonitor, MovementSettings

class MovementTests(unittest.TestCase):
    def test_sustained_boundary_and_extension_use_source_time(self):
        monitor = MovementMonitor(["a"], MovementSettings(min_duration=1, max_gap=.5))
        for timestamp in [0,.5]:
            self.assertEqual(monitor.update(timestamp, {"a":"left"}), [])
        self.assertEqual(monitor.update(1, {"a":"left"})[0]["event_type"], "sustained_movement")
        monitor.update(1.5,{"a":"left"})
        self.assertEqual(len(monitor.events),1)
        self.assertEqual(monitor.events[0]["duration"],1.5)

    def test_unknown_cannot_bridge_duration_or_repetition(self):
        monitor = MovementMonitor(["a"], MovementSettings(min_duration=1,max_gap=.5))
        for timestamp,direction in [(0,"down"),(.5,"down"),(1,"unknown"),(1.5,"down"),(2,"down")]:
            monitor.update(timestamp,{"a":direction})
        self.assertFalse(monitor.events)

    def test_time_gap_restarts_run(self):
        monitor = MovementMonitor(["a"], MovementSettings(min_duration=1,max_gap=.5))
        monitor.update(0,{"a":"left"})
        monitor.update(5,{"a":"left"})
        self.assertFalse(monitor.events)
        self.assertEqual(monitor.states["a"]["start"],5)

    def test_repetition_counts_dwelled_episodes_not_frames(self):
        monitor=MovementMonitor(["a"],MovementSettings(min_duration=100,max_gap=.5,repeat_min_duration=.25))
        directions=["left"]*5+["forward"]+["left"]*5+["forward"]+["left"]*5
        for frame,direction in enumerate(directions):
            monitor.update(frame*.1,{"a":direction})
        self.assertEqual(len(monitor.events),1)
        self.assertEqual(monitor.events[0]["event_type"],"repeated_movement")
        self.assertEqual(monitor.events[0]["repetition_count"],3)

    def test_rapid_label_jitter_is_not_counted_as_repetition(self):
        monitor=MovementMonitor(["a"],MovementSettings(min_duration=100,repeat_min_duration=.25))
        for frame in range(60):
            monitor.update(frame/60,{"a":"left" if frame%2 else "forward"})
        self.assertFalse(monitor.events)

    def test_old_entries_expire_and_seats_are_independent(self):
        monitor=MovementMonitor(["a","b"],MovementSettings(min_duration=100,repetition_window=2,max_gap=2))
        for t in range(7):
            monitor.update(t,{"a":"left" if t%2==0 else "forward","b":"forward"})
        self.assertFalse(monitor.events)

    def test_decimal_frame_intervals_do_not_create_spurious_time_gaps(self):
        monitor = MovementMonitor(["a"], MovementSettings(min_duration=.5, max_gap=.1))
        for frame in range(10):
            monitor.update(frame / 10, {"a": "left"})
        self.assertEqual(len(monitor.events), 1)
        self.assertEqual(monitor.events[0]["start_time"], 0)
        self.assertAlmostEqual(monitor.events[0]["duration"], .9)

    def test_sustained_threshold_includes_decimal_boundary(self):
        monitor = MovementMonitor(["a"], MovementSettings(min_duration=.2, max_gap=.11))
        monitor.update(0, {"a": "forward"})
        for timestamp in (.1, .2, .3):
            monitor.update(timestamp, {"a": "left"})
        self.assertEqual(len(monitor.events), 1)
        self.assertAlmostEqual(monitor.events[0]["observed_at"], .3)

    def test_repetition_window_includes_decimal_boundary(self):
        monitor = MovementMonitor(["a"], MovementSettings(
            min_duration=10, max_gap=.2, repeat_min_duration=.025, repetition_window=.3))
        for timestamp, direction in [(.1,"left"),(.125,"left"),(.15,"forward"),
                                     (.2,"left"),(.225,"left"),(.25,"forward"),
                                     (.35,"left"),(.4,"left")]:
            monitor.update(timestamp, {"a": direction})
        self.assertEqual(len(monitor.events), 1)
        self.assertEqual(monitor.events[0]["event_type"], "repeated_movement")
        self.assertAlmostEqual(monitor.events[0]["duration"], .3)

    def test_invalid_updates_are_transactional_and_timestamp_order_stays_strict(self):
        import copy
        monitor = MovementMonitor(["a"])
        monitor.update(.5, {"a": "left"})
        original_states = copy.deepcopy(monitor.states)
        for timestamp, directions in [(.5,{"a":"left"}), (.5-1e-12,{"a":"left"}),
                                      (float("nan"),{"a":"left"}),
                                      (.6,{"unknown-seat":"left"}), (.6,{"a":"bad"})]:
            with self.subTest(timestamp=timestamp, directions=directions):
                with self.assertRaises(ValueError):
                    monitor.update(timestamp, directions)
                self.assertEqual(monitor.last_timestamp, .5)
                self.assertEqual(monitor.states, original_states)
                self.assertFalse(monitor.events)
        monitor.update(.6, {"a": "left"})
        self.assertEqual(monitor.last_timestamp, .6)

    def test_missing_seat_means_unknown_and_bad_inputs_fail(self):
        monitor=MovementMonitor(["a"])
        monitor.update(0,{})
        self.assertEqual(monitor.states["a"]["direction"],"unknown")
        for t,d in [(0,{}),(-1,{}),(float("nan"),{}),(1,{"x":"left"}),(1,{"a":"misconduct"})]:
            with self.assertRaises(ValueError):monitor.update(t,d)
        for kwargs in [dict(min_duration=0),dict(repetition_count=1),dict(repetition_count=2.5),dict(max_gap=float("nan"))]:
            with self.assertRaises(ValueError):MovementSettings(**kwargs)

if __name__=='__main__':unittest.main()
