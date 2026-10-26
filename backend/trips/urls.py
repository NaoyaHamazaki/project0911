from django.urls import path

from . import views

urlpatterns = [
    path("options/", views.OptionsView.as_view()),
    path("trips/", views.TripListCreateView.as_view()),
    path("trips/validate/", views.TripValidateView.as_view()),
    path("trips/<str:trip_id>/", views.TripDetailView.as_view()),
    path("trips/<str:trip_id>/join-key/", views.TripJoinKeyView.as_view()),
    path("trips/<str:trip_id>/contributions/", views.TripContributionListView.as_view()),
    path("join/<str:join_key>/", views.JoinView.as_view()),
    path("spots/suggest/", views.SpotSuggestView.as_view()),
    path("feature-requests/", views.FeatureRequestListCreateView.as_view()),
    path("places/suggest/", views.PlaceSuggestView.as_view()),
    path("db-status/", views.TableStatusView.as_view()),
    path("db-status/<str:table>/rows/", views.TableRowsView.as_view()),
    path("admin/prompt-settings/", views.PromptSettingsView.as_view()),
    path("admin/general-settings/", views.GeneralSettingsView.as_view()),
]
