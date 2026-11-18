=====================
Event Tracks Timeline
=====================

A Gantt (timeline) view for the tracks of an event. The bridge adds the
**Gantt** view mode to the two track actions of the event tracks application, so
that the tracks of an event can be looked at, moved, resized and planned on a
time grid, in rows by location.

User documentation: ``docs/modules/event_track_gantt.md``.

Features
========

* The event form's **Tracks** button opens the tracks of that event. When the
  view is shown it starts on the event's first day and on a range that fits the
  event: a day, a week, a month or a year. The day is the calendar day, in the
  browser's time zone, of the earliest start among the event and its tracks.
* In developer mode, **Events > Tracks** lists the tracks of every event. Its
  Gantt view opens on the Year range, grouped by Location.
* A track without a location sits in the "Undefined Location" row. A track
  without a start has no pill.
* The popover of a pill shows the track's title, its start and, when the track
  has one, the name of the speaker.
* The track dialog is the event track form without the stage bar, the
  wishlist button and the publish button, and with a footer of its own: Save,
  Discard, Unschedule and a bin button that deletes after a confirmation. Which
  buttons show follows the user's access rights on tracks: Events
  administrators see all of them, Events users cannot delete, and other internal
  users get a read-only form with Discard.
* Unschedule empties the start and the end of the track and keeps its duration.
  The pill goes away and the track stays in the other views.
* The view moves, copies and resizes pills as the Gantt view does, with Undo. It
  has no multi-selection, side panel, dependency arrows or buffers.
* On a phone the view, the popover sheet and the full-screen form with its
  footer follow the Gantt view's phone layout.

Installation
============

Nothing to do: the module installs by itself once the event tracks application
(``website_event_track``) and the Gantt view (``web_gantt``) are both installed.
It is not an application and adds no menu, group or setting. Uninstalling it
takes the Gantt view mode and the added context off the two track actions.

Configuration
=============

None.

Usage
=====

1. Open an event, then click **Tracks** in its button box. Choose the Gantt
   view in the view switcher if the list or kanban view is shown first.
2. Or, in developer mode, open **Events > Tracks** and choose the Gantt view.
3. Click a pill for its popover, Edit (or View) to open the dialog, or drag the
   pill to another time or location.

Known notes
===========

While eCommerce (``website_sale``) is not installed, the module leaves the test
files of the Community module Website Address Autocomplete out of the
``web.assets_tests`` bundle. That module installs by itself with Website, and
its tour uses the tour helpers of eCommerce without depending on it, which would
break every tour of the database. Nothing else is changed, and installing
eCommerce brings the files back.

Credits
=======

Authors: Complete contributors.

Written for Complete from a specification of the behaviour; no source of the
original application was used.

Licence
=======

AGPL-3.0-only.
