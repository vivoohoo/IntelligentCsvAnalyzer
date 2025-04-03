from django.db import models

class UploadedFile(models.Model):
    """Model for storing uploaded CSV files"""
    file = models.FileField(upload_to='uploads/')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    file_size = models.IntegerField(default=0)
    file_type = models.CharField(max_length=10, default='csv')
    
    def __str__(self):
        return f"{self.file.name} ({self.file_size} bytes)"
    
    def save(self, *args, **kwargs):
        # Calculate file size if not already set
        if not self.file_size and self.file:
            self.file_size = self.file.size
            
        # Set file type
        if self.file:
            self.file_type = self.file.name.split('.')[-1].lower()
            
        super().save(*args, **kwargs)

class ChatHistory(models.Model):
    """Model for storing chat history between user and bot"""
    user_input = models.TextField()
    bot_response = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    context = models.JSONField(null=True, blank=True)
    
    class Meta:
        ordering = ['-timestamp']
        verbose_name_plural = "Chat histories"
    
    def __str__(self):
        return f"Chat on {self.timestamp}: {self.user_input[:50]}"
