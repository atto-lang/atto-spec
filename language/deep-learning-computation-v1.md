# Deep-learning computation and model definitions v1

Status: **design proposal; parser, type checker, runtime and backend support NOT_VERIFIED** (2026-11-16).

This proposal defines how AttoLang can express tensor programs, differentiable computation, neural-network models, training and inference. It is a language/API design target, not a claim that any current compiler accepts or executes these examples.

## 1. Goals and non-goals

AttoLang should be a general-purpose systems language that can express deep-learning workloads without becoming an LLM-only DSL.

The design has four distinct layers:

1. **Language surface:** ordinary AttoLang declarations and statements, with explicit **as / end** block delimiters.
2. **Numerical data model:** tensors, shapes, dtypes, layouts, parameters and device-resident storage.
3. **Differentiable computation:** a typed computation graph and automatic differentiation.
4. **Execution:** optimized CPU, GPU and distributed execution, with actors coordinating coarse-grained work.

The language must not conflate actors, tensors, graphs and kernels. Actors coordinate work; tensors hold numerical data; graphs represent mathematical dependencies; kernels execute numerical operations.

This proposal does not define a second model DSL or require Python at runtime.

## 2. Candidate model declaration bodies

Model, layer, training and inference declarations may propose explicit as/end bodies in a future versioned grammar. Indentation is non-semantic. Existing callable brace, begin/end, return-first, conditional fi, range and comma-sequence grammar remains authoritative. The examples below use exploratory model notation; their routine as/end bodies, optional semicolons, shape parameters and member forms are illustrative only, not a change to the ordinary callable grammar. A formatter must not convert existing callable or conditional forms without a separate reviewed grammar and proven semantic equivalence.

The initial target parser must track matching model declaration delimiters, reject missing/extra terminators and preserve nested source spans. No new general newline or block grammar is ratified by this proposal.

## 3. Tensor and shape model

The foundational tensor type is parameterized by element type and logical shape:

~~~atto
Tensor<f32, [Batch, Sequence, Hidden]>
Tensor<f16, [Batch, Heads, Sequence, HeadDim]>
Tensor<i64, [Batch, Sequence]>
Tensor<bf16, [Vocabulary, Hidden]>
~~~

Batch, Sequence, Hidden, Heads, HeadDim and Vocabulary are symbolic dimensions in this proposal. They may be compile-time constants, type-level parameters or runtime dimensions with explicit checks. A compiler must not pretend a runtime dimension is statically known.

The tensor contract should cover:

- Rank, dimensions, element type, strides and storage offset.
- Row-major and other explicitly described layouts.
- Broadcasting and dimension compatibility.
- Contiguous and non-contiguous views.
- Owned storage, read-only views and writable views.
- CPU and device-resident allocations.
- Explicit device transfer and synchronization effects.
- Sparse and quantized representations where supported.
- Overflow-safe shape/stride/address calculations and bounded allocation.

A tensor handle must not imply a deep copy. Views should describe aliasing and lifetime explicitly. Ownership and borrowing rules must prevent use-after-free and conflicting mutable aliases. Moving a tensor between actors or devices must have explicit transfer/share semantics; it must not silently copy an unbounded buffer.

Device placement is an execution property that the runtime and compiler track. The language should allow placement constraints and capabilities without making a particular GPU vendor part of the portable tensor type.

### 3.1 Shape checking

The compiler should reject statically knowable incompatibilities. Matrix multiplication must check its contracting dimensions, and broadcasting must follow one documented rule. Where a dimension is dynamic, the generated program must perform a bounded runtime check and return a typed error or fail with a defined diagnostic.

Shape inference must preserve dimensions through transpose, reshape, slicing, reductions, broadcasting and matrix multiplication. Invalid, overflowing or ambiguous shape transformations must not be silently accepted.

## 4. Model and layer declarations

**define model Name as ... end** declares a model architecture and its parameter tree. **define layer Name as ... end** declares a reusable neural-network component. These declarations are ordinary AttoLang declarations with statically checkable types, visibility and effects.

~~~atto
define layer TransformerBlock as
    int hidden_size = 768
    int attention_heads = 12

    val mut Parameter<f32, [Hidden, Hidden]> query_weights
    val mut Parameter<f32, [Hidden, Hidden]> key_weights
    val mut Parameter<f32, [Hidden, Hidden]> value_weights
    val mut Parameter<f32, [Hidden, Hidden]> output_weights

    pub fnc forward(Tensor<f32, [Batch, Sequence, Hidden]> input): Tensor<f32, [Batch, Sequence, Hidden]> as
        val normalized = rms_norm(input)
        val attended = self.attention(normalized)
        val residual = input + attended
        return self.feed_forward(rms_norm(residual))
    end
end

define model GPT as
    int vocabulary_size = 50000
    int hidden_size = 768
    int layer_count = 12

    define parameters as
        val mut Parameter<f32, [Vocabulary, Hidden]> token_embedding
        val mut Parameter<f32, [Hidden, Vocabulary]> output_weights
    end

    define layers as
        Embedding token_embeddings
        TransformerBlock transformer_blocks
        RMSNorm final_norm
        Linear output_projection
    end

    pub fnc forward(TokenBatch input): Tensor<f32, [Batch, Sequence, Vocabulary]> as
        val hidden = token_embeddings.lookup(input.ids)
        val transformed = transformer_blocks.forward(hidden)
        return output_projection(final_norm(transformed))
    end
end
~~~

The example is structural. Exact parameter initialization, repeated-layer collection syntax, self member resolution and parameter registration require their own library/compiler contracts before this becomes executable source.

A model definition must distinguish architecture and forward computation, trainable parameters and immutable constants, runtime state such as caches, and model metadata/serialization configuration.

A parameter is not merely an ordinary mutable tensor. It needs identity, optimizer-visible state, checkpoint semantics and a defined relationship to the forward graph.

## 5. Attention as a library abstraction

Attention variants should be library implementations of a common semantic contract, not separate built-in language syntax.

~~~atto
pub fnc scaled_dot_product_attention(
    Tensor<f32, [Batch, Heads, Sequence, HeadDim]> query,
    Tensor<f32, [Batch, Heads, Sequence, HeadDim]> key,
    Tensor<f32, [Batch, Heads, Sequence, HeadDim]> value
): Tensor<f32, [Batch, Heads, Sequence, HeadDim]> as
    val scores = matmul(query, transpose(key, 2, 3))
    val scaled_scores = scores / sqrt(HeadDim)
    val weights = softmax(scaled_scores, 3)
    return matmul(weights, value)
end
~~~

The common attention contract should specify mask semantics, causal behavior, scaling, numerical precision, dropout behavior during training, and output shape. Implementations can include MHA, GQA, MQA, MLA, sliding-window, sparse and FlashAttention-style kernels. The compiler/runtime may select an optimized implementation only when it preserves the requested semantics.

## 6. Training and automatic differentiation

Training is expressed as an ordinary named definition. The differentiation API operates on supported tensor computations and model parameters.

~~~atto
define training train_gpt as
    val AdamW optimizer = AdamW(0.0001)

    for Batch batch of dataset do
        val logits = GPT.forward(batch.input)
        val loss = cross_entropy(logits, batch.target)
        val gradients = grad(loss, GPT.parameters())
        optimizer.update(GPT.parameters(), gradients)
    end
end
~~~

The minimum autodiff contract should include reverse-mode differentiation for scalar objectives; gradient rules for differentiable operators; accumulation and reset semantics; explicit stop_gradient boundaries; defined behavior for unused parameters, disconnected graphs and non-finite gradients; custom derivatives with shape/type contracts; finite-difference checks; tape/graph lifetime and memory limits; checkpointing/recomputation; and separately gated higher-order and forward-mode differentiation.

**grad** must not be magical syntax that changes ordinary function meaning. It is a typed library/compiler operation over a differentiable computation representation. An operator with no valid derivative must be rejected for gradient use or require an explicit custom derivative; it must not receive an invented gradient.

## 7. Inference

Inference is declared separately from training because it has different state, memory and scheduling requirements.

~~~atto
define inference GPT as
    val ModelSession session = GPT.new_session()

    for Token token of session.generate(prompt, 256, 0.7) do
        yield token
    end
end
~~~

The inference library should provide explicit contracts for prefill and incremental decoding; KV-cache allocation, ownership, eviction and reuse; continuous batching and sequence scheduling; greedy, top-k, top-p and temperature sampling; streaming output and cancellation; quantized weights and precision selection; prefix caching where safe; and model/session lifetime with bounded memory budgets.

Generation must not recompute a full prompt's attention state for every output token when an incremental cache is available. Cache correctness, sequence identity and cancellation must be tested independently of model quality.

## 8. Mixture of Experts and actor integration

Mixture-of-Experts routing is a model/library concern; actor coordination is an execution/runtime concern. A router selects experts and dispatches token batches. Expert computations remain tensor graphs and kernels.

Actors are appropriate for coarse-grained roles such as expert worker lifecycle and placement, router/dispatcher coordination, cross-device or cross-host work distribution, batch aggregation and backpressure, and supervision/health/bounded retry policy.

Do not create an actor per neuron, tensor element, graph node or kernel launch. That would turn fine-grained numerical work into message scheduling and introduce avoidable overhead. Within one device, dispatch and synchronization should use the GPU execution model; across devices or hosts, actors may coordinate larger batches and transfers.

Top-k routing, capacity constraints, token dropping/padding policy, load balancing loss and deterministic routing behavior need explicit numerical contracts.

## 9. Computation IR and compiler pipeline

The source language should not expose a mandatory graph DSL. The compiler builds a typed, backend-independent computation representation from ordinary AttoLang code where it can prove the required tensor semantics.

Target pipeline:

1. Parse source using the as / end block grammar.
2. Resolve declarations, generic types, effects, ownership and tensor shapes.
3. Lower supported tensor expressions into typed tensor operations.
4. Build a computation IR with data dependencies, control flow, aliasing, device requirements and differentiation metadata.
5. Apply automatic differentiation when requested.
6. Optimize forward and backward graphs: constant folding, dead-code elimination, fusion, layout selection, memory planning and recomputation.
7. Lower to a supported execution backend.
8. Execute with explicit resource, error, cancellation and numerical contracts.

The computation IR must be backend-independent. Backend-specific instructions must not redefine the portable meaning of a tensor operator. AOT is the semantic floor: an operation admitted as portable must have a defined AOT behavior. JIT specialization may improve performance but must not change observable semantics.

The IR should represent tensor values and symbolic shapes; operator identity, attributes and numerical rules; control flow and data dependencies; parameter and constant identity; read/write aliasing and lifetime; differentiability and gradient edges; device placement, transfer and synchronization; and potential failure, cancellation and resource effects.

A graph is an internal compiler/runtime representation, not a requirement that developers manually instantiate graph nodes for every ordinary model operation.

## 10. Backend and runtime boundaries

| Component | Responsibility |
|---|---|
| atto-spec | Normative syntax, types, ownership, effects and semantics |
| atto-tensor | Tensor storage, shapes, strides, views, numerical operations |
| atto-autograd | Differentiation IR, gradient propagation, gradient tests |
| atto-ml | Models, layers, parameters, training and inference APIs |
| atto-ml-conformance | Shared fixtures, tolerances, numerical receipts and backend matrix |
| atto-common-source | Backend-neutral IR and shared compiler contracts |
| atto-source.* | Backend-specific parsing, lowering, code generation and runtime adapters |

CPU execution should be the first portable numerical baseline. SIMD is an optimization over that baseline. GPU support requires explicit device buffers, kernel compilation/dispatch, synchronization and error handling; it must not be described as implemented merely because a backend can emit a GPU-related artifact. Distributed execution is layered on top of correct single-device semantics.

## 11. Introspection and interpretability

Model inspection should be an opt-in runtime facility that does not change the mathematical semantics of normal execution.

The model tooling should be able to capture selected activations, gradients, attention data, residual streams and named intermediate features. Probe registration must be scoped and removable, must obey tensor ownership and device-transfer rules, and must account for additional memory and execution cost.

Feature attribution, sparse autoencoders, activation patching and circuit tracing are higher-level analysis packages. They should not be built into the core tensor type or required by ordinary inference.

## 12. Conformance and acceptance gates

Every capability must be reported as one of **passed**, **failed**, **unsupported** or **not executed** for each backend. Host-side Python/Rust reference tests are useful oracles, but they are not AttoLang guest execution.

Minimum conformance groups:

1. Lexer/parser: nested define, do and over blocks; exact end matching; missing/extra end; newline termination; indentation invariance; malformed continuation.
2. Types/shapes: rank, dimension compatibility, broadcasting, transpose, reshape, reductions and overflow rejection.
3. Ownership: view lifetime, aliasing, read/write permissions, move/transfer and bounded allocation.
4. Numerics: scalar/vector operations, dot, matrix multiplication, reductions, softmax and normalization with documented tolerances.
5. Autodiff: analytical gradients, finite-difference comparison, disconnected graph, non-differentiable operation, accumulation and graph lifetime.
6. Models: parameter registration, forward shape, initialization, serialization and deterministic fixtures.
7. Training: one-step optimizer update, gradient reset/accumulation, cancellation and checkpoint restore.
8. Inference: prefill/decode parity, KV-cache growth/eviction, batching, sampling and cancellation.
9. Distributed/MoE: routing determinism, token conservation, capacity limits, worker failure, backpressure and bounded retry.
10. Backend evidence: exact source commit, compiler/runtime version, target, actual guest test command, results and unsupported capabilities.

No documentation or scaffold manifest may claim a feature is implemented without exact-commit evidence. Parse-only support is not execution support; host reference success is not guest-runtime support; one backend's success is not cross-backend parity.

## 13. Proposed implementation order

1. Finalize the block grammar and parser conformance for as, do, over and end.
2. Finalize tensor shape, stride, ownership and numerical contracts in atto-tensor.
3. Establish the shared typed tensor-operation IR in atto-common-source.
4. Implement a CPU reference execution path and numerical conformance fixtures.
5. Implement reverse-mode autodiff and gradient conformance in atto-autograd.
6. Implement model/layer/parameter APIs in atto-ml.
7. Add training and checkpoint semantics.
8. Add incremental inference, KV cache and batching.
9. Add CPU SIMD and then GPU kernel execution.
10. Add distributed execution and MoE orchestration using actors.
11. Add interpretability and embedding-space tooling.

This order deliberately puts semantics, ownership and executable correctness before model catalogs or distributed performance work.
