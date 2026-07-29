import { useEffect, useRef, useCallback } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function useGsapScroll(selector, options = {}) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const targets = selector ? el.querySelectorAll(selector) : el;
      gsap.from(targets, {
        opacity: 0,
        y: 40,
        duration: 0.7,
        stagger: options.stagger || 0.1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: el,
          start: options.start || 'top 85%',
          toggleActions: 'play none none reverse',
          ...options.scrollTrigger
        },
        ...options.from
      });
    }, el);
    return () => ctx.revert();
  }, []);
  return ref;
}

export function useGsapTimeline(animFn, deps = []) {
  const tl = useRef(null);
  useEffect(() => {
    tl.current = gsap.timeline({ paused: true });
    animFn(tl.current);
    tl.current.play();
    return () => { tl.current?.kill(); };
  }, deps);
  return tl;
}

export function useTilt3D(multiplier = 10) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleMouse = (e) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      gsap.to(el, {
        rotationY: x * multiplier,
        rotationX: -y * multiplier,
        transformPerspective: 1200,
        duration: 0.6,
        ease: 'power2.out'
      });
    };
    const handleLeave = () => {
      gsap.to(el, {
        rotationY: 8,
        rotationX: -4,
        duration: 0.8,
        ease: 'elastic.out(1, 0.4)'
      });
    };
    el.addEventListener('mousemove', handleMouse);
    el.addEventListener('mouseleave', handleLeave);
    return () => {
      el.removeEventListener('mousemove', handleMouse);
      el.removeEventListener('mouseleave', handleLeave);
    };
  }, []);

  return ref;
}

export function usePulseOnChange(dep) {
  const ref = useRef(null);
  const prev = useRef(dep);
  useEffect(() => {
    if (prev.current === dep) return;
    prev.current = dep;
    const el = ref.current;
    if (!el) return;
    gsap.fromTo(el, { scale: 1.05 }, { scale: 1, duration: 0.4, ease: 'back.out(2)' });
  }, [dep]);
  return ref;
}

export function useGsapStagger(selector, options = {}) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const targets = el.querySelectorAll(selector);
      if (!targets.length) return;
      gsap.from(targets, {
        opacity: 0,
        y: 24,
        scale: 0.95,
        duration: 0.5,
        stagger: options.stagger || 0.08,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start: options.start || 'top 88%',
          toggleActions: 'play none none reverse',
          ...options.scrollTrigger
        },
        ...options.from
      });
    }, el);
    return () => ctx.revert();
  }, []);
  return ref;
}

export function useAnimatedCounter(target, suffix = '', duration = 2000) {
  const ref = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const obj = { val: 0 };
      animRef.current = gsap.to(obj, {
        val: target,
        duration: duration / 1000,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 90%',
          toggleActions: 'play none none reverse'
        },
        onUpdate: () => { el.textContent = `${Math.floor(obj.val)}${suffix}`; }
      });
    }, el);
    return () => ctx.revert();
  }, [target, suffix, duration]);

  return ref;
}

export function useStepTransition(step) {
  const ref = useRef(null);
  const prevStep = useRef(step);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prevStep.current !== step) {
      gsap.fromTo(el,
        { opacity: 0, y: 20, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'power2.out', clearProps: 'transform' }
      );
      prevStep.current = step;
    }
  }, [step]);
  return ref;
}
