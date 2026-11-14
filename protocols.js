/* Replace only after receiving a versioned, medically reviewed procedure.
   Approval metadata alone does not validate a procedure. This UI does not
   supply the clinical branching engine needed for an operational protocol. */
const DEMO_PROTOCOL = {
  id: 'UI-DEMO-ONLY',
  version: '1.0',
  status: 'unreviewed-demonstration',
  reviewer: null,
  steps: [
    {
      title: 'Review the reported information',
      text: 'Demonstration: confirm that the selected problem and reported symptoms were recorded correctly. This is an interface task, not a treatment step.'
    },
    {
      title: 'Review data provenance',
      text: 'Demonstration: inspect each reading’s source and timestamp. Synthetic and missing readings must remain clearly labeled.'
    },
    {
      title: 'Approved procedure unavailable',
      text: 'No medically reviewed procedure has been supplied. The app cannot show clinical actions. Use established mission emergency procedures and trained crew resources for operational use.'
    },
    {
      title: 'Review communication status',
      text: 'Demonstration: request support using the alert panel and distinguish provider status from an explicit human acknowledgment. Checklist navigation must never delay a support request.'
    }
  ]
};
