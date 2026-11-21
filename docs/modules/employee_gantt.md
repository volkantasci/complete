# Employees Timeline

The module `hr_gantt` is the link between the Employees application and the
[Gantt View](gantt_view.md). It gives the Gantt view a variant for views whose
rows are employees. It has **no menu, no action and no view of its own**, so
there is nothing to open: you meet it inside the Gantt views that choose it. In
this release the only one is the attendance view (see
[Attendances Timeline](attendance_gantt.md)); the time off view of a later
release will be the next.

The module installs by itself when Employees and the Gantt view are both
installed, and adds no group or setting. It is also what the Attendances bridge
needs: uninstalling it removes that bridge too.

Technical reference:
[`addons/hr_gantt/README.rst`](../../addons/hr_gantt/README.rst).

## What it changes in a view

- **Avatars in the row headers.** Where a row stands for an employee, its header
  starts with the employee's avatar, then the name. An employee without a photo
  gets the generated avatar, a coloured square with the first letter of the
  name. The avatar also shows on an employee's group row when the view groups by
  several fields.
- **The employee card.** A click on an avatar opens the employee card under it,
  with the photo, name, job title, email, phone and a **View Profile** button.
  The card closes on a click elsewhere or on Escape, and the click does not
  scroll the grid. Resting the pointer on the avatar shows the name. On a phone,
  a tap on the avatar opens nothing.
- **Your search reaches the server.** The view tells the server which search
  conditions you have set, so that a view can list employees who have no record
  yet (the attendance view does).
- **A range chosen around today.** When today is inside the period on screen and
  you choose another range, the new range is built around today and not around
  the middle of the visible part. In a view that shows several periods, the whole
  loaded span counts as the period on screen.
- **Diagonal shading.** Where a column has two parts (the half days of the
  Month range) and one half is unavailable, the cell is split by a diagonal
  instead of a vertical line. In a left-to-right language the first half of the
  day (the morning) is the lower-right triangle and the second half the
  upper-left one, so the grey half is in the upper-left corner when the
  afternoon is unavailable. In a right-to-left language the diagonal is
  mirrored: the first half is the lower-left triangle and the second half the
  upper-right one.
- **Lunch rounding of pills.** On a scale with half-day precision, a pill that
  covers both halves of one day is drawn on one half when it clearly lies
  there: one that ends by 14:00 on the morning half, one that begins at 11:00
  or later (and nearer noon than its end) on the afternoon half. The record
  itself does not change. Other scales do not round.

Everything else is the Gantt view's. See the attendance page for the pictures of
all of these: the card is in
[the avatars section](attendance_gantt.md#avatars-and-the-card), the diagonal in
[unavailable cells](attendance_gantt.md#unavailable-cells-and-folded-columns).

## Employees without records

For the views that group by employees, the module has a server helper that
answers the view's data call with **every employee that matches the search**,
also those with no record in the period, paged like any other grouped view. The
rules the helper follows:

- Your search, the period and the read rule of the view's model are first turned
  into conditions on the employees. A condition that cannot be turned into one
  on the employee is left out, as if it were true inside an "and" and false
  inside an "or". An "and" or "or" none of whose parts can be turned into one is
  left out whole (ruling RL26): otherwise the period condition of a week with no
  open attendance would be false and empty every row, while that week must show
  all its employees (scenario A54, probe M68). This differs from the literal text
  of the rule for such operators only; the question stays open for the verifier
  (Q6).
- The employees are searched with your own rights, so you never see a row of an
  employee you may not see. Archived employees appear only when the search asks
  for them.
- The helper accepts exactly one grouping field, which must be a relation; a call
  without the period, without a grouping or with several is refused with an
  error.

The developer reference is in the README.
