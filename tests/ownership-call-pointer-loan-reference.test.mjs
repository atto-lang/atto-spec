// Source-only reference traces, NOT evidence of AttoLang parser, typed MIR, native AOT or guest parity.
// Contract: atto-spec #89 / #18 / #39, reconciled in ownership-bang PR #185.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function check_trace(events) {
  const state = new Map(), handles = new Map();
  const owner = id => {
    if (!state.has(id)) state.set(id, { moved:false, readers:0, writer:false });
    return state.get(id);
  };
  const live = id => {
    const s = owner(id);
    if (s.moved) throw Error("E_MOVED");
    return s;
  };
  for (const e of events) {
    switch (e.op) {
      case "implicit_read": case "explicit_read": {
        const s = live(e.owner);
        if (s.writer) throw Error("E_BORROW");
        s.readers++;
        break;
      }
      case "end_read": {
        const s = live(e.owner);
        if (s.readers === 0) throw Error("E_BORROW");
        s.readers--;
        break;
      }
      case "mutable_read": {
        const s = live(e.owner);
        if (e.writable === false) throw Error("E_BORROW_MUT_REQUIRED");
        if (s.writer || s.readers) throw Error("E_BORROW");
        s.writer = true;
        break;
      }
      case "end_mutable": {
        const s = live(e.owner);
        if (!s.writer) throw Error("E_BORROW");
        s.writer = false;
        break;
      }
      case "take": case "drop": {
        const s = live(e.owner);
        if (s.writer || s.readers) throw Error("E_BORROW");
        s.moved = true;
        break;
      }
      case "shallow_copy": {
        const s = live(e.owner);
        if (s.writer) throw Error("E_BORROW");
        if (e.copyable !== true) throw Error("E_COPY_UNPROVEN");
        if (e.unsafe_mutable_child === true) throw Error("E_COPY_SHALLOW_ALIAS");
        break;
      }
      case "deep_copy": {
        const s = live(e.owner);
        if (s.writer) throw Error("E_BORROW");
        if (e.deep_copyable !== true) throw Error("E_COPY_UNPROVEN");
        break;
      }
      case "scalar_value": { live(e.owner); break; }
      case "ref_local": {
        const s = live(e.owner);
        if (s.writer || handles.has(e.handle)) throw Error("E_BORROW");
        handles.set(e.handle, {owner:e.owner, live:true});
        s.readers++;
        break;
      }
      case "deref": {
        const h = handles.get(e.handle);
        if (!h || !h.live) throw Error("E_POINTER_STALE");
        const s = live(h.owner);
        if (s.writer) throw Error("E_BORROW");
        break;
      }
      case "unref": {
        const h = handles.get(e.handle);
        if (!h || !h.live) throw Error("E_DOUBLE_UNREF");
        h.live = false;
        owner(h.owner).readers--;
        break;
      }
      case "copy_handle": throw Error("E_POINTER_NONCOPY");
      default: throw Error("E_UNKNOWN_OP");
    }
  }
  return { values:[...state], handles:[...handles] };
}

const traces = [
  {
    "name": "two readonly argument loans coexist",
    "ops": [
      [
        "implicit_read",
        "x"
      ],
      [
        "explicit_read",
        "x"
      ],
      [
        "end_read",
        "x"
      ],
      [
        "end_read",
        "x"
      ]
    ],
    "ok": true
  },
  {
    "name": "a caller keeps its owner after a borrowed call",
    "ops": [
      [
        "implicit_read",
        "x"
      ],
      [
        "end_read",
        "x"
      ],
      [
        "implicit_read",
        "x"
      ]
    ],
    "ok": true
  },
  {
    "name": "a mutable loan follows last readonly use",
    "ops": [
      [
        "implicit_read",
        "x"
      ],
      [
        "end_read",
        "x"
      ],
      [
        "mutable_read",
        "x"
      ],
      [
        "end_mutable",
        "x"
      ]
    ],
    "ok": true
  },
  {
    "name": "readonly plus mutable overlap rejected",
    "ops": [
      [
        "implicit_read",
        "x"
      ],
      [
        "mutable_read",
        "x"
      ]
    ],
    "error": "E_BORROW"
  },
  {
    "name": "mutable plus readonly overlap rejected",
    "ops": [
      [
        "mutable_read",
        "x"
      ],
      [
        "implicit_read",
        "x"
      ]
    ],
    "error": "E_BORROW"
  },
  {
    "name": "two exclusive writers rejected",
    "ops": [
      [
        "mutable_read",
        "x"
      ],
      [
        "mutable_read",
        "x"
      ]
    ],
    "error": "E_BORROW"
  },
  {
    "name": "readonly place cannot acquire mutable authority",
    "ops": [
      [
        "mutable_read",
        "x",
        {
          "writable": false
        }
      ]
    ],
    "error": "E_BORROW_MUT_REQUIRED"
  },
  {
    "name": "take while read loan live rejected",
    "ops": [
      [
        "implicit_read",
        "x"
      ],
      [
        "take",
        "x"
      ]
    ],
    "error": "E_BORROW"
  },
  {
    "name": "drop while read loan live rejected",
    "ops": [
      [
        "explicit_read",
        "x"
      ],
      [
        "drop",
        "x"
      ]
    ],
    "error": "E_BORROW"
  },
  {
    "name": "owner can move after loan ends",
    "ops": [
      [
        "implicit_read",
        "x"
      ],
      [
        "end_read",
        "x"
      ],
      [
        "take",
        "x"
      ]
    ],
    "ok": true
  },
  {
    "name": "use after move rejected",
    "ops": [
      [
        "take",
        "x"
      ],
      [
        "implicit_read",
        "x"
      ]
    ],
    "error": "E_MOVED"
  },
  {
    "name": "scalars retain by-value passing",
    "ops": [
      [
        "scalar_value",
        "n"
      ],
      [
        "scalar_value",
        "n"
      ]
    ],
    "ok": true
  },
  {
    "name": "shallow copy needs Copyable proof",
    "ops": [
      [
        "shallow_copy",
        "x",
        {
          "copyable": true
        }
      ]
    ],
    "ok": true
  },
  {
    "name": "unproven shallow copy rejected",
    "ops": [
      [
        "shallow_copy",
        "x"
      ]
    ],
    "error": "E_COPY_UNPROVEN"
  },
  {
    "name": "shallow copy cannot alias unique mutable child",
    "ops": [
      [
        "shallow_copy",
        "x",
        {
          "copyable": true,
          "unsafe_mutable_child": true
        }
      ]
    ],
    "error": "E_COPY_SHALLOW_ALIAS"
  },
  {
    "name": "deep copy needs separate DeepCopyable proof",
    "ops": [
      [
        "deep_copy",
        "x",
        {
          "deep_copyable": true
        }
      ]
    ],
    "ok": true
  },
  {
    "name": "unproven deep copy rejected",
    "ops": [
      [
        "deep_copy",
        "x"
      ]
    ],
    "error": "E_COPY_UNPROVEN"
  },
  {
    "name": "local Pointer ref/deref/unref preserves referent",
    "ops": [
      [
        "ref_local",
        "x",
        {
          "handle": "h"
        }
      ],
      [
        "deref",
        null,
        {
          "handle": "h"
        }
      ],
      [
        "unref",
        null,
        {
          "handle": "h"
        }
      ],
      [
        "implicit_read",
        "x"
      ]
    ],
    "ok": true
  },
  {
    "name": "deref after unref rejected",
    "ops": [
      [
        "ref_local",
        "x",
        {
          "handle": "h"
        }
      ],
      [
        "unref",
        null,
        {
          "handle": "h"
        }
      ],
      [
        "deref",
        null,
        {
          "handle": "h"
        }
      ]
    ],
    "error": "E_POINTER_STALE"
  },
  {
    "name": "double unref rejected",
    "ops": [
      [
        "ref_local",
        "x",
        {
          "handle": "h"
        }
      ],
      [
        "unref",
        null,
        {
          "handle": "h"
        }
      ],
      [
        "unref",
        null,
        {
          "handle": "h"
        }
      ]
    ],
    "error": "E_DOUBLE_UNREF"
  },
  {
    "name": "pointer handle copying never copies ownership",
    "ops": [
      [
        "ref_local",
        "x",
        {
          "handle": "h"
        }
      ],
      [
        "copy_handle",
        "x",
        {
          "handle": "h"
        }
      ]
    ],
    "error": "E_POINTER_NONCOPY"
  },
  {
    "name": "local pointer blocks competing writable loan",
    "ops": [
      [
        "ref_local",
        "x",
        {
          "handle": "h"
        }
      ],
      [
        "mutable_read",
        "x"
      ]
    ],
    "error": "E_BORROW"
  },
  {
    "name": "owner cannot move while local pointer active",
    "ops": [
      [
        "ref_local",
        "x",
        {
          "handle": "h"
        }
      ],
      [
        "take",
        "x"
      ]
    ],
    "error": "E_BORROW"
  },
  {
    "name": "forged pointer handle rejected",
    "ops": [
      [
        "deref",
        null,
        {
          "handle": "forged"
        }
      ]
    ],
    "error": "E_POINTER_STALE"
  }
];
const expand = ops => ops.map(([op,owner,props]) => ({op,owner,...props}));
for (const trace of traces) {
  test('TARGET ONLY: ' + trace.name, () => {
    if (trace.ok) assert.doesNotThrow(() => check_trace(expand(trace.ops)));
    else assert.throws(() => check_trace(expand(trace.ops)), error => error.message === trace.error);
  });
}
test('reference-only evidence boundary', () => {
  assert.equal(traces.length, 24);
  assert.ok(traces.some(t => t.name.includes('mutable')));
  assert.ok(traces.some(t => t.name.includes('Pointer')));
});
