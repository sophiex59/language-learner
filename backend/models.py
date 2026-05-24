import sqlalchemy as sa
from sqlalchemy.orm import relationship
from database import Base
import datetime


class Transcript(Base):
    __tablename__ = "transcripts"
    id = sa.Column(sa.Integer, primary_key=True, index=True)
    created_at = sa.Column(sa.DateTime, default=datetime.datetime.utcnow)
    title = sa.Column(sa.String, nullable=True)
    mode = sa.Column(sa.String, default="lesson")  # "lesson" | "english"
    source_lang = sa.Column(sa.String, default="de")
    target_lang = sa.Column(sa.String, default="en")
    audio_filename = sa.Column(sa.String, nullable=True)
    duration_seconds = sa.Column(sa.Float, nullable=True)
    raw_text = sa.Column(sa.Text, nullable=True)
    utterances_json = sa.Column(sa.Text, nullable=True)  # JSON [{speaker,lang,text,start,end}]
    lessons = relationship("Lesson", back_populates="transcript")


class Lesson(Base):
    __tablename__ = "lessons"
    id = sa.Column(sa.Integer, primary_key=True, index=True)
    created_at = sa.Column(sa.DateTime, default=datetime.datetime.utcnow)
    date = sa.Column(sa.Date, nullable=True)
    title = sa.Column(sa.String, nullable=True)
    topics = sa.Column(sa.Text, nullable=True)
    transcript_id = sa.Column(sa.Integer, sa.ForeignKey("transcripts.id"), nullable=True)
    source = sa.Column(sa.String, default="recorded")  # "recorded" | "manual"
    manual_notes = sa.Column(sa.Text, nullable=True)    # free-text, manual lessons only
    textbook_id = sa.Column(sa.Integer, sa.ForeignKey("textbooks.id"), nullable=True)
    textbook_page_start = sa.Column(sa.Integer, nullable=True)
    textbook_page_end = sa.Column(sa.Integer, nullable=True)
    references_json = sa.Column(sa.Text, nullable=True)  # JSON list of {textbook_id, page_start, page_end}
    # AI recap
    summary_went_well = sa.Column(sa.Text, nullable=True)
    summary_struggles = sa.Column(sa.Text, nullable=True)
    summary_new_vocab = sa.Column(sa.Text, nullable=True) # JSON
    summary_grammar = sa.Column(sa.Text, nullable=True)   # JSON
    summary_homework = sa.Column(sa.Text, nullable=True)
    summary_next_steps = sa.Column(sa.Text, nullable=True) # JSON
    summary_generated_at = sa.Column(sa.DateTime, nullable=True)

    transcript = relationship("Transcript", back_populates="lessons")
    textbook = relationship("Textbook", back_populates="lessons")
    vocab_entries = relationship("VocabEntry", back_populates="lesson")


class VocabEntry(Base):
    __tablename__ = "vocab_entries"
    id = sa.Column(sa.Integer, primary_key=True, index=True)
    created_at = sa.Column(sa.DateTime, default=datetime.datetime.utcnow)
    source_text = sa.Column(sa.String, nullable=False)
    translated_text = sa.Column(sa.String, nullable=True)
    source_lang = sa.Column(sa.String, default="de")
    target_lang = sa.Column(sa.String, default="en")
    context_sentence = sa.Column(sa.Text, nullable=True)
    example_sentence = sa.Column(sa.Text, nullable=True)
    notes = sa.Column(sa.Text, nullable=True)
    textbook_id = sa.Column(sa.Integer, sa.ForeignKey("textbooks.id"), nullable=True)
    textbook_chapter = sa.Column(sa.String, nullable=True)
    lesson_id = sa.Column(sa.Integer, sa.ForeignKey("lessons.id"), nullable=True)
    # Spaced repetition (SM-2)
    srs_interval = sa.Column(sa.Integer, default=1)       # days until next review
    srs_ease = sa.Column(sa.Float, default=2.5)           # ease factor
    srs_due_date = sa.Column(sa.Date, nullable=True)      # next review date
    srs_reviews = sa.Column(sa.Integer, default=0)        # total reviews done

    lesson = relationship("Lesson", back_populates="vocab_entries")
    textbook = relationship("Textbook", back_populates="vocab_entries")


class Textbook(Base):
    __tablename__ = "textbooks"
    id = sa.Column(sa.Integer, primary_key=True, index=True)
    created_at = sa.Column(sa.DateTime, default=datetime.datetime.utcnow)
    title = sa.Column(sa.String, nullable=False)
    nickname = sa.Column(sa.String, nullable=True)  # e.g. "Kursbuch", "Arbeitsbuch"
    filename = sa.Column(sa.String, nullable=False, unique=True)
    page_count = sa.Column(sa.Integer, nullable=True)
    language = sa.Column(sa.String, default="de")
    indexed = sa.Column(sa.Boolean, default=False)

    lessons = relationship("Lesson", back_populates="textbook")
    vocab_entries = relationship("VocabEntry", back_populates="textbook")
    pages = relationship("TextbookPage", back_populates="textbook")
    audio_files = relationship("TextbookAudio", back_populates="textbook")


class TextbookPage(Base):
    __tablename__ = "textbook_pages"
    id = sa.Column(sa.Integer, primary_key=True, index=True)
    textbook_id = sa.Column(sa.Integer, sa.ForeignKey("textbooks.id"))
    page_number = sa.Column(sa.Integer)
    text_content = sa.Column(sa.Text, nullable=True)
    thumbnail_filename = sa.Column(sa.String, nullable=True)
    textbook = relationship("Textbook", back_populates="pages")


class TextbookAudio(Base):
    __tablename__ = "textbook_audio"
    id = sa.Column(sa.Integer, primary_key=True, index=True)
    textbook_id = sa.Column(sa.Integer, sa.ForeignKey("textbooks.id"))
    filename = sa.Column(sa.String, nullable=False)
    chapter = sa.Column(sa.String, nullable=True)
    track_label = sa.Column(sa.String, nullable=True)
    textbook = relationship("Textbook", back_populates="audio_files")


class AITeacherNote(Base):
    __tablename__ = "ai_teacher_notes"
    id = sa.Column(sa.Integer, primary_key=True, index=True)
    created_at = sa.Column(sa.DateTime, default=datetime.datetime.utcnow)
    updated_at = sa.Column(sa.DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    category = sa.Column(sa.String, default="general")  # general|goals|struggles|progress
    content = sa.Column(sa.Text, nullable=False)
    ai_generated = sa.Column(sa.Boolean, default=True)


class ProgressReport(Base):
    __tablename__ = "progress_reports"
    id = sa.Column(sa.Integer, primary_key=True, index=True)
    created_at = sa.Column(sa.DateTime, default=datetime.datetime.utcnow)
    content = sa.Column(sa.Text, nullable=False)
