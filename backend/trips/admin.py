from django import forms
from django.contrib import admin

from .models import AppUser, FeatureRequest, Setting, TripContribution, TripFeedback, TripRequest


@admin.register(TripRequest)
class TripRequestAdmin(admin.ModelAdmin):
    # 公開中の旅は、管理画面で「公開する」を外せば一覧から消える（不適切な公開への対応用）。
    list_display = ("trip_id", "title", "date_from", "date_to", "created_at", "is_public", "public_status")
    list_filter = ("is_public", "public_status")
    search_fields = ("trip_id", "title")


@admin.register(FeatureRequest)
class FeatureRequestAdmin(admin.ModelAdmin):
    list_display = ("nickname", "category", "created_at", "is_published")
    list_filter = ("category", "is_published")


@admin.register(AppUser)
class AppUserAdmin(admin.ModelAdmin):
    list_display = ("nickname", "email", "is_active", "created_at")


class SettingForm(forms.ModelForm):
    class Meta:
        model = Setting
        fields = "__all__"
        widgets = {
            # prompt_intro / prompt_output_items / prompt_rules など長文を編集しやすくする。
            "value": forms.Textarea(attrs={"rows": 12, "cols": 100}),
        }


@admin.register(Setting)
class SettingAdmin(admin.ModelAdmin):
    form = SettingForm
    list_display = ("key", "description", "is_active", "updated_at")
    list_display_links = ("key",)
    readonly_fields = ("updated_at",)
    search_fields = ("key", "description")


@admin.register(TripFeedback)
class TripFeedbackAdmin(admin.ModelAdmin):
    list_display = ("trip", "nickname", "created_at")
    search_fields = ("trip__trip_id", "body")


@admin.register(TripContribution)
class TripContributionAdmin(admin.ModelAdmin):
    list_display = ("trip", "name", "created_at")
    search_fields = ("trip__trip_id", "name")
