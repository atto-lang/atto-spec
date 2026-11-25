; The checked ingress guard is equivalent to fitting a positive i32 exactly.
; Expected outcomes in order: unsat, sat, sat.
(set-logic QF_BV)
(declare-fun value () (_ BitVec 64))
(define-fun signed-i32-maximum () (_ BitVec 64) #x000000007fffffff)
(define-fun lower-ok () Bool (bvsge value (_ bv1 64)))
(define-fun upper-ok () Bool (bvsle value signed-i32-maximum))
(define-fun narrowed () (_ BitVec 32) ((_ extract 31 0) value))
(define-fun positive-i32 () Bool
  (and (= ((_ sign_extend 32) narrowed) value)
       (bvsgt narrowed (_ bv0 32))))

(push 1)
(assert (xor (and lower-ok upper-ok) positive-i32))
(check-sat)
(pop 1)

; A guard with either comparison missing accepts an invalid value.
(push 1)
(assert (and upper-ok (not positive-i32)))
(check-sat)
(pop 1)

(push 1)
(assert (and lower-ok (not positive-i32)))
(check-sat)
(pop 1)
