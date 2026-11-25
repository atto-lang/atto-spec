; Theorem and sensitivity controls for the signed-i64 halve example.
; Expected outcomes in order: unsat, sat, sat.
(set-logic QF_BV)
(declare-fun duration () (_ BitVec 64))
(define-fun divisor () (_ BitVec 64) (_ bv2 64))
(define-fun half () (_ BitVec 64) (bvsdiv duration divisor))
(define-fun meets-postconditions ((result (_ BitVec 64))) Bool
  (and (bvsgt result (_ bv0 64)) (bvsle result duration)))
(define-fun division-admitted () Bool
  (and (distinct divisor (_ bv0 64))
       (not (and (= duration #x8000000000000000) (= divisor #xffffffffffffffff)))))

(push 1)
(assert (bvsge duration (_ bv2 64)))
(assert (not (and division-admitted (meets-postconditions half))))
(check-sat)
(pop 1)

; Removing the caller's lower bound admits duration = 1 and result = 0.
(push 1)
(assert (bvsgt duration (_ bv0 64)))
(assert (not (meets-postconditions half)))
(check-sat)
(pop 1)

; Rounding by 4 violates positivity at duration = 2.
(push 1)
(assert (bvsge duration (_ bv2 64)))
(assert (not (meets-postconditions (bvsdiv duration (_ bv4 64)))))
(check-sat)
(pop 1)
