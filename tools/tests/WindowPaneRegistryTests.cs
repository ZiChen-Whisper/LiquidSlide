using System;
using System.Collections.Generic;

namespace LiquidSlide.ComAddin
{
    public static class WindowPaneRegistryTests
    {
        private sealed class Pane
        {
            internal int Window;
            internal bool Alive = true;
            internal int Releases;
            internal string Material = "clear";
        }

        private static void Require(bool condition, string message)
        { if (!condition) throw new Exception(message); }

        public static string[] Run()
        {
            var passed = new List<string>();
            var registry = new WindowPaneRegistry<Pane>(p => p.Alive, p => p.Releases++);
            var first = registry.GetOrCreate(101, () => new Pane { Window = 101 });
            var second = registry.GetOrCreate(202, () => new Pane { Window = 202 });
            second.Material = "black";
            Require(!ReferenceEquals(first, second) && first.Material == "clear", "Second window shares first window's state");
            passed.Add("Independent panes and material state for two window handles");

            Require(ReferenceEquals(first, registry.GetOrCreate(101, () => { throw new Exception("Duplicate pane"); })), "Reopen replaced a live pane");
            passed.Add("Reopening a live window preserves its pane");

            registry.Remove(101);
            Require(first.Releases == 1 && ReferenceEquals(second, registry.GetOrCreate(202, () => null)), "Closing first window damaged second window");
            passed.Add("Closing the first window leaves the second operational");

            second.Alive = false;
            var rebuilt = registry.GetOrCreate(202, () => new Pane { Window = 202 });
            Require(!ReferenceEquals(second, rebuilt) && second.Releases == 1, "Deleted task pane was reused");
            passed.Add("Deleted or invalid panes are rebuilt only for their owner");

            // Windows of the same presentation still have different handles and independent panes.
            var sameDocumentWindow = registry.GetOrCreate(203, () => new Pane { Window = 203 });
            registry.RemoveWhere((id, _) => id != 203);
            Require(rebuilt.Releases == 1 && sameDocumentWindow.Releases == 0, "Closed-window pruning removed another window");
            passed.Add("Window-level pruning preserves other views of the same document");

            try { registry.GetOrCreate(303, () => { throw new InvalidOperationException("Factory failed"); }); }
            catch (InvalidOperationException) { }
            Require(registry.GetOrCreate(303, () => new Pane { Window = 303 }) != null, "Failed creation poisoned the registry");
            passed.Add("Failed creation can be retried");

            WindowPaneRegistry<Pane> reentrant = null;
            reentrant = new WindowPaneRegistry<Pane>(p => p.Alive, p => { p.Releases++; reentrant.Remove(p.Window); });
            var pane = reentrant.GetOrCreate(404, () => new Pane { Window = 404 });
            reentrant.Clear(); reentrant.Clear();
            Require(pane.Releases == 1, "Disposal callback caused repeated release");
            passed.Add("Synchronous Office disposal callbacks are idempotent");

            var recursiveRejected = false;
            var created = reentrant.GetOrCreate(505, () =>
            {
                try { reentrant.GetOrCreate(505, () => new Pane { Window = 505 }); }
                catch (InvalidOperationException) { recursiveRejected = true; }
                return new Pane { Window = 505 };
            });
            Require(recursiveRejected && ReferenceEquals(created, reentrant.GetOrCreate(505, () => null)), "Recursive activation created two panes");
            passed.Add("Re-entrant activation cannot create duplicate panes");
            return passed.ToArray();
        }
    }
}
