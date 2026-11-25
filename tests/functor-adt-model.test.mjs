import assert from "node:assert/strict";
import test from "node:test";

// SOURCE-FREE REFERENCE MODEL: not a compiler, .atto interpreter, guest run or AOT proof.
const ty = (head, ...args) => Object.freeze({ head, args });
const Int = ty("int"), Bool = ty("bool"), StringType = ty("String");
const Option = inner => ty("Option", inner);
const Result = (ok, err) => ty("Result", ok, err);
const requireShape = (actual, head, arity) => {
  if (actual.head !== head || actual.args.length !== arity) {
    throw new TypeError("wrong " + head + " constructor shape");
  }
};
const mapType = (outer, output) => {
  if (outer.head === "Option") {
    requireShape(outer, "Option", 1);
    return Option(output);
  }
  requireShape(outer, "Result", 2);
  return Result(output, outer.args[1]);
};
const mapErrType = (outer, output) => {
  requireShape(outer, "Result", 2);
  return Result(outer.args[0], output);
};
const flattenType = outer => {
  requireShape(outer, outer.head, outer.head === "Option" ? 1 : 2);
  const inner = outer.args[0];
  requireShape(inner, outer.head, outer.args.length);
  if (outer.head === "Result" && !sameType(outer.args[1], inner.args[1])) {
    throw new TypeError("Result.flatten error domains must be identical");
  }
  return inner;
};
const transposeType = outer => {
  if (outer.head === "Option") {
    requireShape(outer, "Option", 1);
    requireShape(outer.args[0], "Result", 2);
    return Result(Option(outer.args[0].args[0]), outer.args[0].args[1]);
  }
  requireShape(outer, "Result", 2);
  requireShape(outer.args[0], "Option", 1);
  return Option(Result(outer.args[0].args[0], outer.args[1]));
};
const sameType = (a, b) =>
  a.head === b.head && a.args.length === b.args.length
    && a.args.every((sub, i) => sameType(sub, b.args[i]));

const None = Object.freeze({ tag: "None" });
const Some = value => ({ tag: "Some", value });
const Ok = value => ({ tag: "Ok", value });
const Err = value => ({ tag: "Err", value });

const mapOption = (source, f) =>
  source.tag === "None" ? source : Some(f(source.value));
const mapResult = (source, f) =>
  source.tag === "Err" ? source : Ok(f(source.value));
const mapErr = (source, f) =>
  source.tag === "Ok" ? source : Err(f(source.value));
const transposeOptionResult = source =>
  source.tag === "None" ? Ok(None)
  : source.value.tag === "Err" ? source.value
  : Ok(Some(source.value.value));
const transposeResultOption = source =>
  source.tag === "Err" ? Some(source)
  : source.value.tag === "None" ? None
  : Some(Ok(source.value.value));
const flattenResult = source =>
  source.tag === "Err" ? source : source.value;

test("one-layer map keeps the outer constructor and all nested generic slots", () => {
  const outer = Option(Result(Int, StringType));
  assert.deepEqual(mapType(outer, Result(Bool, StringType)),
    Option(Result(Bool, StringType)));
  assert.deepEqual(mapType(Result(Option(Int), StringType), Option(Bool)),
    Result(Option(Bool), StringType));
  assert.deepEqual(mapErrType(Result(Int, StringType), Bool), Result(Int, Bool));
  assert.notDeepEqual(mapType(outer, Result(Bool, StringType)), Option(Bool));
  assert.notDeepEqual(mapType(outer, Result(Bool, StringType)), Result(Option(Bool), StringType));
});

test("flatten rejects error-domain changes while transpose is exactly dual", () => {
  assert.deepEqual(flattenType(Option(Option(Int))), Option(Int));
  assert.deepEqual(flattenType(Result(Result(Int, StringType), StringType)),
    Result(Int, StringType));
  assert.throws(() => flattenType(Result(Result(Int, StringType), Bool)),
    /error domains/);
  assert.throws(() => flattenType(Result(Int, StringType)), /constructor shape/);
  assert.deepEqual(transposeType(Option(Result(Int, StringType))),
    Result(Option(Int), StringType));
  assert.deepEqual(transposeType(Result(Option(Int), StringType)),
    Option(Result(Int, StringType)));
  assert.throws(() => transposeType(Result(Int, StringType)), /constructor shape/);
});

test("all six transpose constructors preserve tags, not null-or-truthiness", () => {
  const optionInputs = [None, Some(Ok(0)), Some(Err("error"))];
  const optionOutputs = [Ok(None), Ok(Some(0)), Err("error")];
  optionInputs.forEach((input, i) =>
    assert.deepEqual(transposeOptionResult(input), optionOutputs[i]));
  const resultInputs = [Err("error"), Ok(None), Ok(Some(false))];
  const resultOutputs = [Some(Err("error")), None, Some(Ok(false))];
  resultInputs.forEach((input, i) =>
    assert.deepEqual(transposeResultOption(input), resultOutputs[i]));
});

test("nested map calls active callbacks once per layer and never on dormant variants", () => {
  const calls = [];
  const f = v => { calls.push("inner"); return v + 1; };
  const innerMap = v => { calls.push("outer"); return mapResult(v, f); };
  assert.deepEqual(mapOption(Some(Ok(41)), innerMap), Some(Ok(42)));
  assert.deepEqual(calls, ["outer", "inner"]);
  calls.length = 0;
  assert.deepEqual(mapOption(Some(Err("e")), innerMap), Some(Err("e")));
  assert.deepEqual(calls, ["outer"]);
  calls.length = 0;
  assert.deepEqual(mapOption(None, innerMap), None);
  assert.deepEqual(calls, []);
  assert.deepEqual(mapErr(Ok(7), () => { throw Error("dormant"); }), Ok(7));
  assert.deepEqual(flattenResult(Ok(Err("e"))), Err("e"));
  assert.deepEqual(flattenResult(Err("outer")), Err("outer"));
});

test("pure functor identity and composition laws hold for both ADTs", () => {
  const id = x => x;
  const f = x => x + 2;
  const g = x => x * 3;
  for (const opt of [None, Some(0), Some(3)]) {
    assert.deepEqual(mapOption(opt, id), opt);
    assert.deepEqual(mapOption(mapOption(opt, f), g),
      mapOption(opt, x => g(f(x))));
  }
  for (const result of [Err("bad"), Ok(0), Ok(3)]) {
    assert.deepEqual(mapResult(result, id), result);
    assert.deepEqual(mapResult(mapResult(result, f), g),
      mapResult(result, x => g(f(x))));
  }
});
