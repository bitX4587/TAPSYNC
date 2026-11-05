import type { PublicProfileDto } from '@tapsync/shared';
import Image from 'next/image';

interface ProfileHeaderProps {
  profile: PublicProfileDto;
}

export function ProfileHeader({ profile }: ProfileHeaderProps) {
  const displayName = profile.fullName || 'TapSync user';
  const hasAvatar = !!profile.avatarUrl;

  return (
    <header className="profile-header">
      {hasAvatar && profile.avatarUrl && (
        <div className="avatar-container">
          <Image
            src={profile.avatarUrl}
            alt={`${displayName}'s profile picture`}
            className="avatar"
            width={120}
            height={120}
          />
        </div>
      )}
      
      <h1 className="profile-name">{displayName}</h1>
      
      {profile.designation && (
        <p className="profile-designation">{profile.designation}</p>
      )}
      
      {profile.company && (
        <p className="profile-company">{profile.company}</p>
      )}
      
      {profile.bio && (
        <p className="profile-bio">{profile.bio}</p>
      )}
      
      {((profile.contact?.email) || (profile.contact?.phone)) && (
        <div className="profile-contact">
          {profile.contact?.email && (
            <a 
              href={`mailto:${profile.contact.email}`}
              className="contact-link"
              aria-label={`Email ${displayName}`}
            >
              {profile.contact.email}
            </a>
          )}
          {profile.contact?.phone && (
            <a 
              href={`tel:${profile.contact.phone}`}
              className="contact-link"
              aria-label={`Call ${displayName}`}
            >
              {profile.contact.phone}
            </a>
          )}
        </div>
      )}
    </header>
  );
}
