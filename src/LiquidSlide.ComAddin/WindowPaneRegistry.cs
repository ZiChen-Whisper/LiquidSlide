using System;
using System.Collections.Generic;

namespace LiquidSlide.ComAddin
{
    // Kept independent of COM so ownership, stale entries and re-entrant disposal can be tested.
    internal sealed class WindowPaneRegistry<T> where T : class
    {
        private readonly Dictionary<int, T> panes = new Dictionary<int, T>();
        private readonly HashSet<int> creating = new HashSet<int>();
        private readonly Func<T, bool> isAlive;
        private readonly Action<T> release;

        internal WindowPaneRegistry(Func<T, bool> isAlive, Action<T> release)
        { this.isAlive = isAlive; this.release = release; }

        internal T GetOrCreate(int windowId, Func<T> create)
        {
            if (panes.TryGetValue(windowId, out var existing))
            {
                if (isAlive(existing)) return existing;
                Remove(windowId);
            }
            if (!creating.Add(windowId)) throw new InvalidOperationException("该窗口的面板正在初始化。");
            try
            {
                var pane = create();
                panes.Add(windowId, pane);
                return pane;
            }
            finally { creating.Remove(windowId); }
        }

        internal bool TryGet(int windowId, out T pane) => panes.TryGetValue(windowId, out pane);

        internal void Remove(int windowId)
        {
            if (!panes.TryGetValue(windowId, out var pane)) return;
            // Remove first: Office can raise control-disposal events synchronously from Delete().
            panes.Remove(windowId);
            release(pane);
        }

        internal void RemoveWhere(Func<int, T, bool> predicate)
        {
            foreach (var pair in Snapshot())
                if (predicate(pair.Key, pair.Value) && panes.TryGetValue(pair.Key, out var current) && ReferenceEquals(current, pair.Value)) Remove(pair.Key);
        }

        internal KeyValuePair<int, T>[] Snapshot()
        {
            var result = new KeyValuePair<int, T>[panes.Count];
            ((ICollection<KeyValuePair<int, T>>)panes).CopyTo(result, 0);
            return result;
        }

        internal void Clear() { foreach (var pair in Snapshot()) Remove(pair.Key); }
    }
}
