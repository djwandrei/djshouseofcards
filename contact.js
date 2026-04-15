/**
 * Static contact form helper.
 * -----------------------------------------------------------------------------
 * The site remains a static frontend, so the contact page builds a mailto link
 * instead of posting to a backend. This file validates the required fields first
 * so the user gets immediate feedback before their email client opens.
 */

window.DJ = window.DJ || {};

(() => {
  const DJ = window.DJ;
  let mailtoFallbackTimer = 0;

  /**
   * Attach validation to the static contact form and build the outgoing mailto link.
   */
  function initContactForm() {
    const form = document.getElementById('contactForm');
    if (!form) {
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');

    const setSubmittingState = (isSubmitting) => {
      if (!submitButton) return;
      submitButton.disabled = isSubmitting;
      submitButton.setAttribute('aria-busy', String(isSubmitting));
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      window.clearTimeout(mailtoFallbackTimer);
      DJ.setStatus('contactStatus');
      setSubmittingState(true);

      const name = form.name.value.trim();
      const email = form.email.value.trim();
      const subject = form.subject.value.trim() || 'Website Inquiry';
      const message = form.message.value.trim();

      if (!name || !email || !message) {
        DJ.setStatus(
          'contactStatus',
          'Please complete your name, email, and message before creating the email draft.',
          'error'
        );
        setSubmittingState(false);
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        DJ.setStatus(
          'contactStatus',
          'Enter a valid email address before creating the email draft.',
          'error'
        );
        setSubmittingState(false);
        return;
      }

      DJ.setStatus('contactStatus', 'Opening your email app with a prefilled draft...', 'success');

      const encodedSubject = encodeURIComponent(`Website Inquiry: ${subject}`);
      const encodedBody = encodeURIComponent(`Hello DJ,\n\nName: ${name}\nEmail: ${email}\n\n${message}\n`);
      mailtoFallbackTimer = window.setTimeout(() => {
        DJ.setStatus(
          'contactStatus',
          'If your email app did not open, send your message to contact@djshouseofcards-comics.com and mention the subject line you entered above.',
          'info'
        );
        setSubmittingState(false);
      }, 1400);
      window.location.href = `mailto:contact@djshouseofcards-comics.com?subject=${encodedSubject}&body=${encodedBody}`;
      window.setTimeout(() => {
        setSubmittingState(false);
      }, 300);
    });
  }

  // Wait for the contact form markup to exist before attaching listeners.
  document.addEventListener('DOMContentLoaded', initContactForm);
})();
